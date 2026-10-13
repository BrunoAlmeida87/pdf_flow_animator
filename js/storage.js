// ProjectStore — persistência local em IndexedDB.
//   projects: { id, name, updatedAt, thumbnail, data }  (data = projeto serializado, sem bytes)
//   assets:   key "<projectId>/<assetId>" → { kind, mime, name, blob }
//   meta:     key → valor (ex.: lastProjectId)
// IndexedDB não tem o limite de ~5 MB do localStorage e guarda Blobs nativamente (PDFs,
// áudio de narração). Todas as operações são assíncronas e falham "macio" (null/false).

const ProjectStore = {
    DB_NAME: 'pdf-flow-animator',
    DB_VERSION: 1,
    _dbPromise: null,

    isAvailable() {
        try { return typeof indexedDB !== 'undefined' && indexedDB !== null; } catch (e) { return false; }
    },

    _open() {
        if (!this._dbPromise) {
            this._dbPromise = new Promise((resolve, reject) => {
                let req;
                try {
                    req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
                } catch (e) {
                    reject(e);
                    return;
                }
                req.onupgradeneeded = () => {
                    const db = req.result;
                    if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
                    if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets');
                    if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
                req.onblocked = () => reject(new Error('IndexedDB bloqueado'));
            }).catch((e) => {
                this._dbPromise = null;
                throw e;
            });
        }
        return this._dbPromise;
    },

    async _tx(stores, mode, fn) {
        const db = await this._open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(stores, mode);
            let result;
            Promise.resolve(fn(tx)).then((r) => { result = r; }, reject);
            tx.oncomplete = () => resolve(result);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error || new Error('transação abortada'));
        });
    },

    _req(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    // record = { id, name, updatedAt, thumbnail, data }; assets = [{ id, kind, mime, name, bytes }]
    // Só regrava assets que ainda não estão no banco para este projeto (savedAssetIds).
    async saveProject(record, assets, savedAssetIds) {
        await this._tx(['projects', 'assets', 'meta'], 'readwrite', (tx) => {
            tx.objectStore('projects').put(record);
            const store = tx.objectStore('assets');
            for (const a of assets || []) {
                if (savedAssetIds && savedAssetIds.has(a.id)) continue;
                store.put({ kind: a.kind, mime: a.mime, name: a.name || '', blob: new Blob([a.bytes], { type: a.mime }) },
                    record.id + '/' + a.id);
            }
            tx.objectStore('meta').put(record.id, 'lastProjectId');
        });
        return true;
    },

    async loadProject(id) {
        const record = await this._tx(['projects'], 'readonly', (tx) => this._req(tx.objectStore('projects').get(id)));
        if (!record) return null;
        const assetIds = Object.keys((record.data && record.data.assets) || {});
        const assets = [];
        await this._tx(['assets'], 'readonly', async (tx) => {
            const store = tx.objectStore('assets');
            for (const assetId of assetIds) {
                const a = await this._req(store.get(id + '/' + assetId));
                if (a) assets.push({ id: assetId, kind: a.kind, mime: a.mime, name: a.name, blob: a.blob });
            }
        });
        for (const a of assets) a.bytes = new Uint8Array(await a.blob.arrayBuffer());
        return { record, assets };
    },

    async listProjects() {
        const all = await this._tx(['projects'], 'readonly', (tx) => this._req(tx.objectStore('projects').getAll()));
        return (all || [])
            .map((r) => ({ id: r.id, name: r.name, updatedAt: r.updatedAt, thumbnail: r.thumbnail }))
            .sort((a, b) => b.updatedAt - a.updatedAt);
    },

    async deleteProject(id) {
        await this._tx(['projects', 'assets', 'meta'], 'readwrite', (tx) => {
            tx.objectStore('projects').delete(id);
            const store = tx.objectStore('assets');
            const range = IDBKeyRange.bound(id + '/', id + '/￿');
            store.delete(range);
        });
        const last = await this.getMeta('lastProjectId');
        if (last === id) await this.setMeta('lastProjectId', null);
        return true;
    },

    async renameProject(id, name) {
        await this._tx(['projects'], 'readwrite', async (tx) => {
            const store = tx.objectStore('projects');
            const r = await this._req(store.get(id));
            if (r) {
                r.name = name;
                if (r.data) r.data.name = name;
                store.put(r);
            }
        });
    },

    async getMeta(key) {
        try {
            return await this._tx(['meta'], 'readonly', (tx) => this._req(tx.objectStore('meta').get(key)));
        } catch (e) {
            return null;
        }
    },

    async setMeta(key, value) {
        return this._tx(['meta'], 'readwrite', (tx) => { tx.objectStore('meta').put(value, key); });
    }
};
