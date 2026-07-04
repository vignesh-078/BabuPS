if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME   = process.env.DB_NAME || 'pawnshop';

let db     = null;
let client = null;

async function connectDB() {
  if (db) return db;
  if (!MONGO_URI) throw new Error('MONGO_URI environment variable is not set');

  client = new MongoClient(MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });

  try {
    await client.connect();
    db = client.db(DB_NAME);
    console.log('✅ Connected to MongoDB Atlas —', DB_NAME);
    return db;
  } catch (err) {
    db = null;
    client = null;
    throw err;
  }
}

// ─── Health check ──────────────────────────────────────────────────────────────
// GET /api  →  { ok: true }
app.get('/', (req, res) => res.json({ ok: true, service: 'BabuPS API' }));

// ─── GET all loans ─────────────────────────────────────────────────────────────
// Vercel mounts this file at /api, so the route inside is /loans (not /api/loans)
app.get('/loans', async (req, res) => {
  try {
    await connectDB();
    const loans = await db.collection('loans').find({}).sort({ dateGiven: -1 }).toArray();
    res.json(loans);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch loans', detail: err.message });
  }
});

// ─── POST create loan ──────────────────────────────────────────────────────────
app.post('/loans', async (req, res) => {
  try {
    await connectDB();
    const loan   = sanitizeLoan(req.body);
    const result = await db.collection('loans').insertOne(loan);
    const created = await db.collection('loans').findOne({ _id: result.insertedId });
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create loan', detail: err.message });
  }
});

// ─── PUT update loan ───────────────────────────────────────────────────────────
app.put('/loans/:id', async (req, res) => {
  try {
    await connectDB();
    const id     = new ObjectId(req.params.id);
    const update = sanitizeLoan(req.body);
    delete update._id;
    await db.collection('loans').updateOne({ _id: id }, { $set: update });
    const updated = await db.collection('loans').findOne({ _id: id });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update loan', detail: err.message });
  }
});

// ─── PUT close loan ────────────────────────────────────────────────────────────
app.put('/loans/:id/close', async (req, res) => {
  try {
    await connectDB();
    const id  = new ObjectId(req.params.id);
    const now = new Date();
    await db.collection('loans').updateOne(
      { _id: id },
      { $set: { status: 'Closed', dateReturn: now } }
    );
    const updated = await db.collection('loans').findOne({ _id: id });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to close loan', detail: err.message });
  }
});

// ─── DELETE loan ───────────────────────────────────────────────────────────────
app.delete('/loans/:id', async (req, res) => {
  try {
    await connectDB();
    const id = new ObjectId(req.params.id);
    await db.collection('loans').deleteOne({ _id: id });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete loan', detail: err.message });
  }
});

function sanitizeLoan(body) {
  const loan = {};
  if (body.serial     !== undefined) loan.serial     = body.serial;
  if (body.name       !== undefined) loan.name       = body.name;
  if (body.amount     !== undefined) loan.amount     = Number(body.amount)  || 0;
  if (body.dateGiven  !== undefined) loan.dateGiven  = body.dateGiven  ? new Date(body.dateGiven)  : null;
  if (body.dateReturn !== undefined) loan.dateReturn = body.dateReturn ? new Date(body.dateReturn) : null;
  if (body.status     !== undefined) loan.status     = body.status;
  if (body.item       !== undefined) loan.item       = body.item;
  if (body.weight     !== undefined) loan.weight     = Number(body.weight)  || 0;
  if (body.notes      !== undefined) loan.notes      = body.notes;
  return loan;
}

module.exports = app;
