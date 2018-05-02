import * as cors from "@koa/cors";
import * as fs from "fs";
import * as http from "http";
import * as http2 from "http2";
import * as https from "https";
import * as Koa from "koa";
import * as compress from "koa-compress";
import conditional = require("koa-conditional-get");
import etag = require("koa-etag");
import * as serve from "koa-static";
import * as path from "path";
import * as winston from "winston";

export interface IKoaServerOptions {
    staticPath: string;
    useHttp2?: boolean;
    useHttps?: boolean;
    cert?: string | Buffer | Array<string | Buffer>;
    key?: string | Buffer | Array<string | Buffer>;
    wsCert?: string | Buffer | Array<string | Buffer>;
    wsKey?: string | Buffer | Array<string | Buffer>;
    entry?: string;
    maxAge?: number;
    setHeaders?: (response: http2.Http2ServerResponse, filePath: string, stat: any) => void;
    configure?: (server: KoaServer) => void;
    webpackConfig?: any;
}

export class KoaServer {
    /** Default max age of HTTP caching: 30 days. */
    private static _defaultMaxAge = 60 * 60 * 24 * 30;

    /** The default certificate for HTTPS. */
    private static _defaultCert = fs.readFileSync(path.resolve(__dirname, "../cert/localhost.crt"));

    /** The default private key of HTTPS certificate. */
    private static _defaultKey = fs.readFileSync(path.resolve(__dirname, "../cert/localhost.key"));

    /**
     * The default certificate for WebSocket used in Hot Module Replacement (HMR).
     * CN=127.0.0.1 due to https://github.com/webpack-contrib/webpack-hot-client/issues/50.
     */
    private static _defaultWsCert = fs.readFileSync(path.resolve(__dirname, "../cert/127.0.0.1.crt"));

    /** The default private key of the WebSocket certificate used in Hot Module Replacement (HMR). */
    private static _defaultWsKey = fs.readFileSync(path.resolve(__dirname, "../cert/127.0.0.1.key"));

    /** The options of the server. */
    private _options: IKoaServerOptions;

    /** The Koa app that handles requests. */
    private _app: Koa;

    /** The HTTP/2 server. */
    private _server: http2.Http2Server | http.Server | https.Server;

    /** The WebSocket server for Hot Module Replacement (HMR). */
    private _wsServer: http.Server | https.Server | undefined;

    /** Configures the Koa app. */
    private _configure: (server: KoaServer) => void = this.configureDefault.bind(this);

    /** The Koa app that handles requests. */
    public get app(): Koa { return this._app; }

    /** Gets the HTTP/2 server. */
    public get httpServer(): http2.Http2Server | http.Server | https.Server { return this._server; }

    /** Gets a value indicating whether it is development environment. */
    public get isDev(): boolean { return this.app.env === "development"; }

    /** Gets the certificate for HTTPS. */
    private get cert(): string | Buffer | Array<string | Buffer> {
        return this._options.cert || KoaServer._defaultCert;
    }

    /** Gets the private key of HTTPS certificate. */
    private get key(): string | Buffer | Array<string | Buffer> {
        return this._options.key || KoaServer._defaultKey;
    }

    /** Gets the certificate for WebSocket. */
    private get wsCert(): string | Buffer | Array<string | Buffer> {
        return this._options.cert || KoaServer._defaultWsCert;
    }

    /** Gets the private key of WebSocket certificate. */
    private get wsKey(): string | Buffer | Array<string | Buffer> {
        return this._options.key || KoaServer._defaultWsKey;
    }

    /**
     * Initializes a new instance of @see {KoaServer} class.
     * @param options The server options.
     */
    constructor(options: IKoaServerOptions) {
        this._app = new Koa();
        winston.info(`Koa app environment: ${this.app.env}`);

        this._options = options;
        const { useHttp2, useHttps, configure } = options;
        if (useHttp2) {
            this._server = useHttps
                ? http2.createSecureServer({ cert: this.cert, key: this.key })
                : http2.createServer();
        } else {
            this._server = useHttps
                ? https.createServer({ cert: this.cert, key: this.key })
                : http.createServer();
        }

        if (this.isDev && (useHttp2 || useHttps)) {
            // HTTP/2 doesn't support WebSocket; webpack-hot-client doesn't support WebSocker over HTTPS properly
            // Create a separate WebSocket server as a workaround
            this._wsServer = useHttps
                ? https.createServer({ cert: this.wsCert, key: this.wsKey })
                : http.createServer();
        }

        if (configure) {
            this._configure = configure;
        }
    }

    /**
     * Configures the static files.
     */
    public configureFiles(): void {
        const app = this.app;
        const { staticPath, entry, maxAge, setHeaders, webpackConfig } = this._options;

        if (this.isDev) {
            // Development mode
            // Use require instead of import to only load HMR modules in development mode
            const hmr = require("./hmr");
            hmr.configureHmr(app, this._wsServer || this._server, webpackConfig);
        } else {
            // Resource revalidation
            app.use(conditional());
            app.use(etag());

            // Static files
            const serveOptions: serve.Options = {};
            if (setHeaders) {
                serveOptions.setHeaders = setHeaders as any;
            } else if (entry || maxAge) {
                serveOptions.setHeaders = this.setCacheControl as any;
            }

            app.use(serve(staticPath, serveOptions));
        }
    }

    /**
     * Configures the Koa app using the default settings.
     */
    public configureDefault(): void {
        const app = this.app;

        // Enable compression
        app.use(compress());

        // Cross-Origin Resource Sharing (CORS)
        app.use(cors());

        this.configureFiles();
    }

    /**
     * Promisified method that starts the Koa server and listens to the specified port.
     * If in development mode, Hot Module Replacement (HMR) will be enabled too.
     * @param port The port to listen to.
     * @param hostname The hostname of the server, default is localhost.
     */
    public async listen(port: number, hostname?: string): Promise<void> {
        if (typeof hostname === "undefined" && this.isDev) {
            hostname = "localhost";
        }

        return new Promise<void>(resolve => {
            if (this._wsServer) {
                // If a separate WebSocket server is used, start it first
                this._wsServer.listen(port + 1, hostname, () => {
                    this.startHttpServer(port, hostname, resolve);
                });
            } else {
                this.startHttpServer(port, hostname, resolve);
            }
            });
    }

    /**
     * Starts the HTTP(S) server and listens to the specified port.
     * @param port The port to listen to.
     * @param hostname The hostname of the server, default is localhost.
     * @param callback The function to be called when the HTTP server starts listening.
     */
    private startHttpServer(port: number, hostname: string | undefined, callback: () => void): void {
        const listeningListener = this.listeningListener.bind(this, callback);
        if (typeof hostname === "undefined") {
            this.httpServer.listen(port, listeningListener);
        } else {
            this.httpServer.listen(port, hostname, listeningListener);
        }
    }

    /**
     * Sets the cache control header.
     */
    private setCacheControl = (response: http2.Http2ServerResponse, filePath: string, _stat: any): void => {
        const { entry, maxAge } = this._options;
        if (entry && entry.toLocaleLowerCase() === path.basename(filePath).toLocaleLowerCase()) {
            // Do not cache the entry file, because
            // 1. It is usually very small
            // 2. Its content will change between builds, although the file name is the same
            response.setHeader("Cache-Control", "no-cache");
        } else {
            // All other files have content hash in their names,
            // which means the file name will change if content is different
            // Thus, they can be cached for a very long time (30 days, but can be longer)
            response.setHeader("Cache-Control", `max-age=${maxAge || KoaServer._defaultMaxAge}`);
        }
    }

    /**
     * Invoked when the HTTP server emits "listening" event.
     * @param callback The function to be called when the HTTP server starts listening.
     */
    private listeningListener(callback: () => void): void {
        const server = this.httpServer;

        // Configure the app until the server is started, so that server information can be used
        this._configure(this);
        server.on("request", this.app.callback());
        winston.info(`Koa server listening on port ${server.address().port}`);
        callback();
    }
}
