// Mock implementation for Redis to ensure the MVP runs on Windows without Docker
// In a real production environment, replace this with `new Redis(process.env.REDIS_URL)`

class MockRedis {
    constructor() {
        this.store = new Map();
        this.lists = new Map();
    }

    async get(key) {
        return this.store.get(key) || null;
    }

    async set(key, value) {
        this.store.set(key, value.toString());
        return 'OK';
    }

    async del(key) {
        this.store.delete(key);
        return 1;
    }

    // List operations
    async lpush(key, value) {
        if (!this.lists.has(key)) this.lists.set(key, []);
        this.lists.get(key).unshift(value.toString());
        return this.lists.get(key).length;
    }

    async lrange(key, start, stop) {
        if (!this.lists.has(key)) return [];
        const list = this.lists.get(key);
        // Simple mock: if stop is -1, return all
        if (stop === -1) return list.slice(start);
        return list.slice(start, stop + 1);
    }

    async lrem(key, count, value) {
        if (!this.lists.has(key)) return 0;
        let list = this.lists.get(key);
        const initialLen = list.length;
        this.lists.set(key, list.filter(item => item !== value.toString()));
        return initialLen - this.lists.get(key).length;
    }
}

export const redis = new MockRedis();
