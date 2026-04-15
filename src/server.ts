import express from "express";
import { Router, Request, Response } from "express";
import cors from "cors";

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

  const url = `https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(query)}.json`;
  const response = await fetch(url, { headers: IMDB_HEADERS });
  const data = (await response.json()) as any;

  const movies = (data.d ?? [])
    .filter((item: any) => item.qid === "movie" || item.qid === "tvSeries")
    .slice(0, 5)
    .map((item: any) => ({
      name: item.l,
      id: item.id,
      year: item.y,
      cast: item.s,
      src: item.i?.imageUrl ?? null,
    }));

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
