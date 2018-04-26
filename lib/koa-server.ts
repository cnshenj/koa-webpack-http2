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
    useHttps?: boolean;
    cert?: string | Buffer | Array<string | Buffer>;
    key?: string | Buffer | Array<string | Buffer>;
    wsCert?: string | Buffer | Array<string | Buffer>;
    wsKey?: string | Buffer | Array<string | Buffer>;
    entry?: string;
    maxAge?: number;
    setHeaders?: (response: http2.Http2ServerResponse, filePath: string, stat: any) => void;
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
    private _server: http2.Http2Server;

    /** The WebSocket server for Hot Module Replacement (HMR). */
    private _wsServer: http.Server | https.Server;

    /** Configures the Koa app. */
    private _configure = this.configureDefault.bind(this);

    /** The Koa app that handles requests. */
    public get app(): Koa { return this._app; }

    /** Gets the HTTP/2 server. */
    public get httpServer(): http2.Http2Server { return this._server; }

    /** Sets the function that configures the Koa app. */
    public set configure(value: (app: Koa) => void) { this._configure = value; }

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
        this._options = options;
        this._app = new Koa();
        winston.info(`Koa app environment: ${this.app.env}`);

        let { useHttps } = options;
        if (typeof useHttps === "undefined") {
            useHttps = true;
        }

        this._server = useHttps
            ? http2.createSecureServer({ cert: this.cert, key: this.key })
            : http2.createServer();
        this._wsServer = useHttps
            ? https.createServer({ cert: this.wsCert, key: this.wsKey })
            : http.createServer();
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
            hmr.configureHmr(app, this._wsServer, webpackConfig);
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
        return new Promise<void>(resolve => {
            this.listenToServer(port, hostname || "localhost", resolve);
        });
    }

    /**
     * Starts the server and listens to the specified port.
     * If in development mode, Hot Module Replacement (HMR) will be enabled too.
     * @param port The port to listen to.
     * @param hostname The hostname of the server, default is localhost.
     * @param callback The function to be called when the HTTP server is started.
     */
    private listenToServer(port: number, hostname: string, callback: () => void): void {
        if (this.isDev) {
            // HTTP/2 doesn't support WebSocket, use a separate HTTP/1.1 server instead
            this._wsServer.listen(port + 1, hostname, () => {
                this._configure();
                this.startHttpServer(port, hostname, callback);
            });
        } else {
            this._configure();
            this.startHttpServer(port, hostname, callback);
        }
    }

    /**
     * Starts the HTTP(S) server and listens to the specified port.
     * @param port The port to listen to.
     * @param hostname The hostname of the server, default is localhost.
     * @param callback The function to be called when the HTTP server is started.
     */
    private startHttpServer(port: number, hostname: string, callback: () => void): void {
        const server = this.httpServer;
        server.on("request", this.app.callback());
        server.listen(port, hostname, () => {
            winston.info(`Koa server listening on port ${server.address().port}`);
            callback();
        });
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
}
