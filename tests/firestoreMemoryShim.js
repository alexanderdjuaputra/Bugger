/* =====================================================================
   tests/firestoreMemoryShim.js — TEST-ONLY in-memory stand-in
   ---------------------------------------------------------------------
   This is NOT part of the production code path. It is never required by
   api/index.js, never deployed to Vercel, and never talks to anything
   real. It exists for one reason: I cannot reach real Google Cloud
   servers from this sandbox (no network route to googleapis.com), so I
   cannot run the automated test suite against a real Firebase project.

   This file implements just enough of the Firestore Admin SDK's surface
   — the handful of methods server-app.js actually calls — to let the
   exact same server-app.js business logic run and be verified locally:
   collection/doc/get/set/create/update/delete, subcollections, simple
   `where(field, '==', value)` queries, batch writes, and transactions.

   What it deliberately does NOT simulate: real network latency,
   Firestore's optimistic-concurrency retry behaviour under genuine
   concurrent writes, security rules, or Firestore query indexing limits.
   For a true end-to-end check against your real project, also run
   `npm run seed` against it once and click through both sites yourself
   (see PANDUAN_DEPLOY.md, "Uji coba sebelum go-live").
   ===================================================================== */

function createMemoryFirestore() {
  const store = new Map(); // "collectionName/docId" -> { data, subcollections: Map }

  function pathKey(collection, id) { return `${collection}/${id}`; }

  function getNode(collection, id) {
    const key = pathKey(collection, id);
    if (!store.has(key)) store.set(key, { data: null, subcollections: new Map() });
    return store.get(key);
  }

  function makeDocRef(collection, id) {
    return {
      id,
      collection(subName) { return makeCollectionRef(`${collection}/${id}/${subName}`); },
      async get() {
        const node = getNode(collection, id);
        return { id, exists: node.data !== null, data: () => node.data ? { ...node.data } : undefined };
      },
      async set(data, opts) {
        const node = getNode(collection, id);
        node.data = opts && opts.merge && node.data ? { ...node.data, ...data } : { ...data };
      },
      async create(data) {
        const node = getNode(collection, id);
        if (node.data !== null) {
          const e = new Error(`Document ${collection}/${id} already exists.`);
          e.code = 6; // ALREADY_EXISTS, matches real Admin SDK error code
          throw e;
        }
        node.data = { ...data };
      },
      async update(data) {
        const node = getNode(collection, id);
        if (node.data === null) throw new Error(`Document ${collection}/${id} does not exist.`);
        node.data = { ...node.data, ...data };
      },
      async delete() {
        const node = getNode(collection, id);
        node.data = null;
      },
      // internal, used by the transaction shim below
      _ref: { collection, id },
    };
  }

  let autoIdCounter = 0;
  function makeCollectionRef(collection) {
    return {
      doc(id) { return makeDocRef(collection, id != null ? String(id) : `auto_${++autoIdCounter}`); },
      async add(data) {
        const ref = makeDocRef(collection, `auto_${++autoIdCounter}`);
        await ref.set(data);
        return ref;
      },
      where(field, op, value) {
        if (op !== '==') throw new Error('Memory shim only supports the "==" operator.');
        return {
          async get() {
            const prefix = `${collection}/`;
            const docs = [];
            for (const [key, node] of store.entries()) {
              if (key.startsWith(prefix) && node.data !== null && node.data[field] === value) {
                const id = key.slice(prefix.length);
                docs.push({ id, data: () => ({ ...node.data }) });
              }
            }
            return { empty: docs.length === 0, size: docs.length, docs };
          },
        };
      },
      async get() {
        const prefix = `${collection}/`;
        const docs = [];
        for (const [key, node] of store.entries()) {
          if (key.startsWith(prefix) && node.data !== null) {
            const id = key.slice(prefix.length);
            // exclude deeper subcollection paths from a shallow collection scan
            if (!id.includes('/')) docs.push({ id, data: () => ({ ...node.data }) });
          }
        }
        return { empty: docs.length === 0, size: docs.length, docs };
      },
    };
  }

  return {
    collection(name) { return makeCollectionRef(name); },

    batch() {
      const ops = [];
      return {
        set(ref, data, opts) { ops.push({ type: 'set', ref, data, opts }); },
        delete(ref) { ops.push({ type: 'delete', ref }); },
        update(ref, data) { ops.push({ type: 'update', ref, data }); },
        async commit() {
          for (const op of ops) {
            const docRef = makeDocRef(op.ref._ref.collection, op.ref._ref.id);
            if (op.type === 'set') await docRef.set(op.data, op.opts);
            else if (op.type === 'delete') await docRef.delete();
            else if (op.type === 'update') await docRef.update(op.data);
          }
        },
      };
    },

    // Sequential, single-process transaction: real enough to verify
    // correctness of the read-check-write logic in server-app.js. Real
    // Firestore additionally retries on cross-client contention, which
    // this single-threaded shim has no need to simulate.
    async runTransaction(fn) {
      const tx = {
        async get(ref) { return makeDocRef(ref._ref.collection, ref._ref.id).get(); },
        set(ref, data, opts) { makeDocRef(ref._ref.collection, ref._ref.id).set(data, opts); },
        update(ref, data) { makeDocRef(ref._ref.collection, ref._ref.id).update(data); },
        delete(ref) { makeDocRef(ref._ref.collection, ref._ref.id).delete(); },
      };
      return fn(tx);
    },

    // exposed for tests that want to simulate a fresh serverless cold
    // start re-reading the same underlying data (a new createApp(db)
    // call against the SAME store, proving session lookups are not
    // relying on in-process memory).
    _rawStore: store,
  };
}

module.exports = createMemoryFirestore;
