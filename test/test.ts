import * as views from "koa-views";
import * as path from "path";

import { IKoaServerOptions, KoaServer } from "../lib/koa-server";

const configure = (server: KoaServer) => {
    server.configureDefault();

    const app = server.app;

    // View engine setup
    app.use(views(path.resolve(__dirname, "views"), { extension: "pug" }));
    app.use(async (ctx, _next) => {
        await ctx.render("index");
    });
};

const options: IKoaServerOptions = {
    staticPath: path.resolve(__dirname, "public/dist"),
    useHttp2: true,
    useHttps: true,
    configure
};

const dev = "development";
if ((process.env.NODE_ENV || dev) === dev) {
    // tslint:disable-next-line:no-var-requires
    options.webpackConfig = require("./webpack.config");
}

const webServer = new KoaServer(options);
webServer.listen(8080);
