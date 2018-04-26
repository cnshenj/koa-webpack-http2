const path = require("path");
const webpack = require("webpack");

module.exports = {
    mode: "development",
    devtool: "cheap-module-eval-source-map",
    entry: {
        index: [
            path.resolve(__dirname, "public/index.js")
        ]
    },
    output: {
        path: path.resolve(__dirname, "public/dist"),
        filename: "[name].js",
        chunkFilename: "[id].[chunkhash:8].js",
        publicPath: "/"
    },
    watchOptions: {
        ignored: /node_modules/
    }
}
