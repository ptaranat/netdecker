import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dev } from "$app/environment";

interface CacheEntry<T> {
	data: T;
	timestamp: number;
}

const store = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL = 60 * 60 * 1000; // 1 hour
const DEV_CACHE_DIR = ".cache";

function devCachePath(key: string): string {
	return `${DEV_CACHE_DIR}/${key}.json`;
}

function loadFromDisk<T>(key: string, ttl: number): T | null {
	if (!dev) return null;
	const path = devCachePath(key);
	if (!existsSync(path)) return null;

	try {
		const raw = readFileSync(path, "utf-8");
		const entry: CacheEntry<T> = JSON.parse(raw);
		if (Date.now() - entry.timestamp > ttl) return null;
		store.set(key, entry);
		return entry.data;
	} catch {
		return null;
	}
}

function saveToDisk<T>(key: string, data: T): void {
	if (!dev) return;
	try {
		mkdirSync(DEV_CACHE_DIR, { recursive: true });
		const entry: CacheEntry<T> = { data, timestamp: Date.now() };
		writeFileSync(devCachePath(key), JSON.stringify(entry));
	} catch (err) {
		console.warn("Failed to write dev cache:", err);
	}
}

export function getCached<T>(key: string, ttl = DEFAULT_TTL): T | null {
	const entry = store.get(key) as CacheEntry<T> | undefined;
	if (entry) {
		if (Date.now() - entry.timestamp > ttl) {
			store.delete(key);
		} else {
			return entry.data;
		}
	}

	return loadFromDisk<T>(key, ttl);
}

export function setCache<T>(key: string, data: T): void {
	store.set(key, { data, timestamp: Date.now() });
	saveToDisk(key, data);
}

export function getStale<T>(key: string): T | null {
	const entry = store.get(key) as CacheEntry<T> | undefined;
	if (entry) return entry.data;

	return loadFromDisk<T>(key, Infinity);
}
