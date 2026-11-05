// Reference-counted loads. A URL stays on the GPU while at least one zone holds it.

export function createRegistry(app) {
  const records = new Map();
  let active = 0;
  const waiters = [];
  const MAX = 2;

  function pump() {
    while (active < MAX && waiters.length) {
      active += 1;
      const job = waiters.shift();
      job();
    }
  }

  function loadAsset(url, type) {
    return new Promise((resolve, reject) => {
      const run = () => {
        app.assets.loadFromUrl(url, type, (err, asset) => {
          active -= 1;
          pump();
          if (err) reject(err);
          else resolve(asset);
        });
      };
      waiters.push(run);
      pump();
    });
  }

  return {
    async retain(url, type) {
      let rec = records.get(url);
      if (!rec) {
        rec = { url, type, count: 0, asset: null, error: null, promise: null, holders: new Set() };
        rec.promise = loadAsset(url, type).then((asset) => {
          rec.asset = asset;
          return asset;
        }).catch((err) => {
          rec.error = err;
          throw err;
        });
        records.set(url, rec);
      }
      rec.count += 1;
      const asset = await rec.promise;
      return asset;
    },
    release(url) {
      const rec = records.get(url);
      if (!rec) return;
      rec.count -= 1;
      if (rec.count > 0) return;
      const asset = rec.asset;
      records.delete(url);
      if (!asset) return;
      try { asset.unload(); } catch (err) { console.warn('unload', url, err); }
      try { app.assets.remove(asset); } catch (err) { console.warn('remove', url, err); }
    },
    snapshot() {
      const rows = [];
      for (const rec of records.values()) {
        rows.push({
          url: rec.url,
          count: rec.count,
          ready: !!rec.asset,
          error: rec.error ? String(rec.error.message || rec.error) : ''
        });
      }
      return rows;
    }
  };
}
