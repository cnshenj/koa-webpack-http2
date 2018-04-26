const del = require("del");
const gulp = require("gulp");
const path = require("path");
const sourcemaps = require("gulp-sourcemaps");
const tsc = require("gulp-typescript");
const ts = require("typescript");

const paths = {
    lib: "lib",
    test: "test"
};

function getMapSource(sourcePath) {
    // Since source/map/target files are in same directory, just keep the file name so VSCode can find source file
    const index = sourcePath.lastIndexOf("/");
    return index < 0 ? sourcePath : sourcePath.substr(index + 1);
}

const tsProject = tsc.createProject("tsconfig.json");
gulp.task("tsc", () => {
    const result = tsProject.src()
        .pipe(sourcemaps.init())
        .pipe(tsProject());
    return result.js
        .pipe(sourcemaps.write(".", { includeContent: false, mapSources: getMapSource }))
        .pipe(gulp.dest("."));
});

function watchTypeScriptProject(configFileName) {
    const reportDiagnostic = ts.createDiagnosticReporter(ts.sys);
    const configParseResult = ts.parseConfigFileWithSystem(configFileName, {}, ts.sys, reportDiagnostic);
    const watchCompilerHost = ts.createWatchCompilerHostOfConfigFile(
        configParseResult.options.configFilePath,
        {},
        ts.sys,
        undefined,
        reportDiagnostic,
        ts.createWatchStatusReporter(ts.sys, configParseResult.options));
    watchCompilerHost.rootFiles = configParseResult.fileNames;
    watchCompilerHost.options = configParseResult.options;
    watchCompilerHost.configFileSpecs = configParseResult.configFileSpecs;
    watchCompilerHost.configFileWildCardDirectories = configParseResult.wildcardDirectories;
    ts.createWatchProgram(watchCompilerHost);
}

gulp.task("watch", () => {
    watchTypeScriptProject("tsconfig.json");
});


gulp.task("clean", () => {
    return del([
        "index.{js,js.map,d.ts}",
        `${paths.lib}/**/*.{js,map,d.ts}`,
        `${paths.test}/**/*.{js,map,d.ts}`,
        `!${paths.test}/webpack.config.js`,
        `!${paths.test}/public/index.js`
    ]);
});
