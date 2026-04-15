import 'dotenv/config';
import express from "express";
import { Router, Request, Response } from "express";
import cors from "cors";

const SUPPORTED_PLATFORMS = ['netflix', 'prime', 'disney', 'hbo', 'apple'] as const;
type Platform = typeof SUPPORTED_PLATFORMS[number];

interface MovieItem {
  name: string;
  id: string;
  year: number;
  cast: string;
  src: string | null;
}

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY ?? '';
const STREAMING_COUNTRY = process.env.STREAMING_COUNTRY ?? 'us';

async function isAvailableOnPlatform(
  imdbId: string,
  platform: Platform,
  signal: AbortSignal
): Promise<boolean> {
  const url = `https://streaming-availability.p.rapidapi.com/shows/${imdbId}?country=${STREAMING_COUNTRY}`;
  const response = await fetch(url, {
    headers: { 'X-RapidAPI-Key': RAPIDAPI_KEY },
    signal,
  });

  if (!response.ok) {
    return false;
  }

  const data = (await response.json()) as any;
  const options: any[] = data?.streamingOptions?.[STREAMING_COUNTRY] ?? [];
  return options.some((opt: any) => opt?.service?.id === platform);
}

async function filterByPlatform(
  movies: MovieItem[],
  platform: Platform
): Promise<MovieItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const results = await Promise.allSettled(
      movies.map((movie) => isAvailableOnPlatform(movie.id, platform, controller.signal))
    );

    return movies.filter((_, i) => {
      const result = results[i];
      return result.status === 'fulfilled' && result.value === true;
    });
  } finally {
    clearTimeout(timeout);
  }
}

const app = express();

app.use(cors());
app.use(express.json());

const route = Router();

const IMDB_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
};

route.get("/", (req: Request, res: Response) => {
  res.json({ message: "Hello world" });
});

route.get("/movies", async (req: Request, res: Response) => {
  const query = req.query.q as string;

  if (!query) {
    res.status(400).json({ error: "Query param 'q' is required" });
    return;
  }

  const platform = req.query.platform as string | undefined;

  if (platform !== undefined) {
    if (platform === '') {
      res.status(400).json({ error: "platform parameter cannot be empty" });
      return;
    }
    if (!(SUPPORTED_PLATFORMS as readonly string[]).includes(platform)) {
      res.status(400).json({
        error: `Unsupported platform: "${platform}". See supportedPlatforms for valid options.`,
        supportedPlatforms: SUPPORTED_PLATFORMS,
      });
      return;
    }
  }

  const url = `https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(query)}.json`;
  const response = await fetch(url, { headers: IMDB_HEADERS });
  const data = (await response.json()) as any;

  let movies: MovieItem[] = (data.d ?? [])
    .filter((item: any) => item.qid === "movie" || item.qid === "tvSeries")
    .slice(0, 5)
    .map((item: any) => ({
      name: item.l,
      id: item.id,
      year: item.y,
      cast: item.s,
      src: item.i?.imageUrl ?? null,
    }));

  if (platform !== undefined) {
    try {
      movies = await filterByPlatform(movies, platform as Platform);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        res.status(504).json({ error: "Upstream streaming service timed out" });
        return;
      }
      res.status(502).json({ error: `Upstream streaming service unavailable: ${err?.message ?? String(err)}` });
      return;
    }
  }

  res.json(movies);
});

route.get("/movies/related/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  const query = `{
    title(id: "${id}") {
      moreLikeThisTitles(first: 5) {
        edges {
          node {
            id
            titleText { text }
            primaryImage { url }
            releaseYear { year }
          }
        }
      }
    }
  }`;

  const response = await fetch("https://api.graphql.imdb.com/", {
    method: "POST",
    headers: { ...IMDB_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  const data = (await response.json()) as any;
  const edges = data?.data?.title?.moreLikeThisTitles?.edges ?? [];

  const movies = edges.map((edge: any) => ({
    name: edge.node.titleText?.text,
    id: edge.node.id,
    year: edge.node.releaseYear?.year,
    cover: edge.node.primaryImage?.url ?? null,
  }));

  res.json(movies);
});

app.use(route);

app.listen(3333, () => console.log("server running on port 3333"));
