import cheerio from "cheerio";

const url = "https://www.imdb.com/find/?q=um%20sonho%20de%20liberdade";

fetch(url)
  .then(response => response.text())
  .then(body => parseBody(body));

function parseBody(body: string) {
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

  console.log(movies);
}
