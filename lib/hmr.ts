import * as http from "http";
import * as https from "https";
import * as Koa from "koa";
import * as koaWebpack from "koa-webpack";
import * as webpack from "webpack";
import * as winston from "winston";

/**
 * Configures Hot Module Replacement (HMR).
 * @param app The Koa app.
 */
export function configureHmr(app: Koa, server: http.Server | https.Server, webpackConfig: any): void {
    const compiler = webpack(webpackConfig);

    compiler.hooks.done.tap("done", stats => {
        const json = stats.toJson();
        if (stats.hasErrors()) {
            winston.error(json.errors);
        }

        if (stats.hasWarnings()) {
            winston.warn(json.warnings);
        }

        winston.info(`webpack compilation completed in ${json.time}ms`);
    });

    app.use(koaWebpack({
        compiler,
        dev: {
            publicPath: webpackConfig.output.publicPath,
            stats: "none"
        },
        hot: {
            https: server instanceof https.Server,
            // Pass in the server instance so it can be used by hot module replacement
            server,
            // Reload page if modules can't be patched
            reload: true
        } as any
    }));
}
