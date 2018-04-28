# koa-webpack-http2

An HTTP/2 web server using Koa framework and webpack development/HMR middleware.

Features:
- *Only* supports HTTP/2, requires Node.js 8.4.0 or higher. Recommended: Node.js 10.0.0 or above.
- Built-in webpack development and HMR (Hot Module Replacement) support (using a separate HTTP/1.1 server, since HTTP/2 doesn't support WebSocket).
- Provides default development SSL certificate for both HTTPS and Secure WebSocket (see details below).

## Usage
### Installation
```
npm install --save koa-webpack-http2
```
or
```
yarn add koa-webpack-http2
```

### Code
```js
const KoaServer = require("koa-webpack-http2").KoaServer;
const server = new KoaServer({
    // Path to static files (webpack generated scripts and files)
    staticPath: path.resolve(__dirname, "./public"),
    // Default is false. Most browsers only support HTTP/2 over TLS (HTTPS)
    useHttp2: true,
    // Default is false
    useHttps: true,
    // Optional, a default certificate is provided
    cert: fs.readFileSync(path.resolve(__dirname, "./cert/myhost.crt")),
    // Optional, a default private key is provided
    key: fs.readFileSync(path.resolve(__dirname, "./cert/myhost.key")),
    // Optional, a default certificate is provided
    wsCert: fs.readFileSync(path.resolve(__dirname, "./cert/ws.crt")),
    // Optional, a default certificate is provided
    wsKey: fs.readFileSync(path.resolve(__dirname, "./cert/ws.key")),
    // Entry script file name, not cached unless overridden by setHeaders
    entry: "index.js",
    // Cache max age in seconds for all static files except the entry script. Default is 2592000 (30 days).
    // The webpack configuration should add hash to chunk names so they will be reloaded whenever changed
    maxAge: 86400,
    // Set customer headers, or override default cache behavior
    setHeaders: (response /* http2.Http2ServerResponse */, filePath /* string */, stat) => {},
    // Configure the server and the Koa app (e.g. app.use(cors()))
    configure?: (server /* KoaServer */, app /* Koa */) => {
        // Default configuration includes compression, CORS,
        // webpack middleware in development environment, and static files in production environment
        server.configureDefault();

        // View engine setup
        app.use(views(path.resolve(__dirname, "views"), { extension: "pug" }));
        app.use(async (ctx, next) => {
            await ctx.render("index");
        });
    };
    // The webpack configuration for development environment
    webpackConfig: require(./webpack.dev.js)
});
server.listen(8080).then(() => { console.log("Koa server started."); });
```
Note: webpack development and HMR middleware are only required in development environment.

## HTTP/2
`koa-webpack-http2` supports HTTP/2 using Node.js native `http2` module. `http2` module has been available as an experimental feature since Node.js 8.4.0, and a stable feature in Node.js 10.

## webpack
Built-in `webpack` development and HMR support is provided by `koa-webpack` module.

## SSL certificates
Two SSL certificates are provided for development and HMR (valid from 1/1/2018 to 12/31/2099).
- localhost.crt and localhost.key
- 127.0.0.1.crt and 127.0.0.1.key

`koa-webpack` internally uses `webpack-hot-client` to provide HMR.
When debugging HTTPS server locally, the URL looks like this: `https://localhost:8080/`. Thus, an SSL certificate with `/CN=localhost` needs to be used. The server instance then is passed to `webpack-hot-client`. `webpack-hot-client` tries to call `server.address()` to determine the address of WebSocket server for HMR. `server.address()` always returns the bound address, which is `127.0.0.1` for `localhost`. Since an SSL certificate is only valid when its common name (`/CN`) matches the hostname, a separate SSL certificate with `/CN=127.0.0.1` is used for the WebSocket server.

The SSL certificates should be added to the OS's trusted root so browsers won't block access to the development server. Or you can provide your own certificates which are trusted.