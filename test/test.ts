import * as views from "koa-views";
import * as path from "path";

import { IKoaServerOptions, KoaServer } from "../lib/koa-server";

const options: IKoaServerOptions = {
    staticPath: path.resolve(__dirname, "public/dist")
};

const dev = "development";
if (process.env.NODE_ENV || dev === dev) {
    options.webpackConfig = require("./webpack.config");
}

const server = new KoaServer(options);

server.configure = () => {
    server.configureDefault();

    const app = server.app;

    // View engine setup
    app.use(views(path.resolve(__dirname, "views"), { extension: "pug" }));
    app.use(async (ctx, _next) => {
        await ctx.render("index");
    });
};

server.listen(8080);
