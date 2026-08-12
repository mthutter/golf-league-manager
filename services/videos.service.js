import {
    createWriteStream,
    existsSync
} from "fs";
import {
    mkdir,
    readFile
} from "fs/promises";
import {
    join
} from "path";
import {
    pipeline
} from "stream/promises";
import {
    Readable
} from "stream";

const CACHE_DIR = join(process.cwd(), "cache");
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache expiration

// Ensure cache directory exists at startup
await mkdir(CACHE_DIR, {
    recursive: true
}).catch(() => {});

export const getVideos = async (year) => {
    const collectionId = process.env[`BUNNY_COLLECTION_${year}`];
    if (!collectionId) {
        return [];
    }

    const cachePath = join(CACHE_DIR, `videos_${year}.json`);

    try {
        // 1. Cache Hit: Check if file exists and is fresh (within TTL)
        if (existsSync(cachePath)) {
            const stats = await import("fs/promises").then((fs) => fs.stat(cachePath));
            const isFresh = Date.now() - stats.mtimeMs < CACHE_TTL_MS;

            if (isFresh) {
                const cachedData = await readFile(cachePath, "utf-8");
                return JSON.parse(cachedData);
            }
        }

        // 2. Cache Miss: Request fresh list from Bunny API
        const response = await fetch(`https://video.bunnycdn.com/library/${process.env.BUNNY_LIBRARY_ID}/videos?page=1&itemsPerPage=100&collection=${collectionId}`, {
            headers: {
                AccessKey: process.env.BUNNY_VIDEO_API_KEY,
            },
        });

        if (!response.ok) {
            throw new Error(`Bunny API returned ${response.status}`);
        }

        // 3. Process Stream: Map and stream JSON to disk without buffering the raw API body
        const rawData = await response.json();
        const mappedItems = rawData.items.map((video) => ({
            type: "video",
            src: `https://player.mediadelivery.net/embed/${process.env.BUNNY_LIBRARY_ID}/${video.guid}?autoplay=false&responsive=true`,
            title: video.title || `Video ${video.guid.slice(0, 6)}`,
        }));

        // Stream the processed array to disk asynchronously
        const nodeReadable = Readable.from(JSON.stringify(mappedItems));
        const diskWritable = createWriteStream(cachePath);
        await pipeline(nodeReadable, diskWritable);

        return mappedItems;
    } catch (error) {
        console.error(`Error fetching/caching videos for year ${year}:`, error);

        // Fallback: If Bunny API goes down, serve stale cache if available
        if (existsSync(cachePath)) {
            const cachedData = await readFile(cachePath, "utf-8");
            return JSON.parse(cachedData);
        }

        throw error;
    }
};