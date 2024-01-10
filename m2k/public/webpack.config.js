const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require("copy-webpack-plugin");
const path = require('path');

module.exports = {
    mode: 'development',
    entry: './src/index.js',
    output: {
        filename: 'main.js',
        path: path.resolve(__dirname, 'dist'),
    },
    plugins: [
        new HtmlWebpackPlugin(),
        new CopyPlugin({
            patterns: [
                { from: "main.wasm", to: "main.wasm" },
                { from: "fib.wasm", to: "fib.wasm" },
                { from: "maintiny.wasm", to: "maintiny.wasm" },
            ],
        }),
    ],
};