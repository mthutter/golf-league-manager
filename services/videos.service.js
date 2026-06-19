const collectionMap = {
  2024: process.env.BUNNY_COLLECTION_2024,
  2025: process.env.BUNNY_COLLECTION_2025,
  2026: process.env.BUNNY_COLLECTION_2026,
};

export const getVideos = async (year) => {
  const collectionId = process.env[`BUNNY_COLLECTION_${year}`];

  if (!collectionId) {
    return [];
  }

  const response = await fetch(
    `https://video.bunnycdn.com/library/${process.env.BUNNY_LIBRARY_ID}/videos?page=1&itemsPerPage=100&collection=${collectionId}`,
    {
      headers: {
        AccessKey: process.env.BUNNY_VIDEO_API_KEY,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Bunny API returned ${response.status}`);
  }

  const data = await response.json();

  return data.items.map((video) => ({
    type: "video",
    src: `https://player.mediadelivery.net/embed/${process.env.BUNNY_LIBRARY_ID}/${video.guid}?autoplay=false&responsive=true`,
    title: video.title || `Video ${video.guid.slice(0, 6)}`,
  }));
};
