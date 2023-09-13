import express from "express";
import { Router, Request, Response } from "express";
import cheerio from "cheerio";
import qs from "qs";

const app = express();

const route = Router();

app.use(express.json());

function getMoviesSearch(body: string) {
  const $ = cheerio.load(body);
  let movies: any = [];
  $("ul.ipc-metadata-list > li").each(function (this: cheerio.Element) {
    const link = $(this).find("a");
    const movie = {
      name: link.text(),
      id: link.attr("href")?.split("/")[2],
    };
    movies.push(movie);
  });

  return movies;
}

route.get("/", (req: Request, res: Response) => {
  res.json({ messae: "Hello world" });
});

route.get("/movies", async (req: Request, res: Response) => {
  const url = `https://www.imdb.com/find/?${qs.stringify(req.query)}`;
  const response = await fetch(url, {
    headers: {
      "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    },
  });

  const body = await response.text();

  const movies = await getMoviesSearch(body);

  res.json(movies);
});

app.use(route);

app.listen(3333, () => "server running on port 3333");
