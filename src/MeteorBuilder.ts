const spawn = require('child_process').spawn;
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const pathResolve = path.resolve;
const _ = require('underscore');

import {Config} from './config';

import {EventEmitter} from 'events';

export class MeteorBuilder extends EventEmitter {

  protected config : Config;

  constructor(config : Config) {
    super();
    this.config = config;
  }

  public buildApp(appPath : string, buildLocation : string, bundlePath : string, start) : Promise<any> {
    start = _.once(start);

    const appName = this.config.app.name;
    const meteorBinary = this.config.meteor.binary || 'meteor';

    if (meteorBinary !== 'meteor') {
      this.log(`Using meteor: ${meteorBinary}`);
    }

    bundlePath = bundlePath || pathResolve(buildLocation, 'bundle.tar.gz');
    if (fs.existsSync(bundlePath)) {
      this.log(`Found existing bundle file: ${bundlePath}`);
      return Promise.resolve(0);
    }

    let buildFinish = Promise.resolve(0);

    buildFinish = buildFinish.then(() => {
      this.log(`Building started: ${appName}`);
      this.emit('build.started', { message: 'Build started', bundlePath, buildLocation });
      start();
      return Promise.resolve(0);
    });

    const npmJsonConfig = pathResolve(appPath,"package.json");

    if (fs.existsSync(npmJsonConfig)) {
      // always rebuild npm modules because the binary format might be different.
      buildFinish = buildFinish.then((code : number) => {
        return this.meteorCommand(appPath, meteorBinary, ["npm", "install"]);
      });
      buildFinish = buildFinish.then((code : number) => {
        return this.meteorCommand(appPath, meteorBinary, ["npm", "rebuild"]);
      });
    }

    const typingsConfig = pathResolve(appPath,"typings.json");

    if (fs.existsSync(typingsConfig)) {
      buildFinish = buildFinish.then((code : number) => {
        return this.normalCommand(appPath, "typings", ["install"]);
      });
    }

    buildFinish = buildFinish.then((code : number) => {
      return this.buildMeteorApp(appPath, meteorBinary, buildLocation);
    });
    buildFinish = buildFinish.then((code : number) => {
      this.log(`Builder returns: ${code}`);
      if (code == 0) {
        return Promise.resolve(code);
      }
      return Promise.reject(code);
    });

    buildFinish.catch((code : number) => {
      console.error("\n=> Build Error. Check the logs printed above.");

      this.emit('fail', `Build error, please check the console log output.`);

      throw new Error("Build error. Please check the console log output.");
    });
    return buildFinish.then((code : number) => {
      // 0 = success
      this.log("Build succeed.");
      this.emit('build.finished', { message: 'Build succeed', bundlePath, buildLocation });

      return this.archiveIt(buildLocation, bundlePath, { 
        level: 6,
        // memLevel : 
        // chunkSize
      });
    });
  }

  public archiveIt(buildLocation : string, bundlePath : string, gzipOptions : any) : Promise<any> {
    let sourceDir = pathResolve(buildLocation, 'bundle');
    bundlePath = bundlePath || pathResolve(buildLocation, 'bundle.tar.gz');

    this.emit('archive.started', { message: "Archiving the files...", bundlePath, buildLocation });
    this.log('Archiving the files...');
    this.log("Creating tar bundle at: " + bundlePath);
    this.log("Bundle source: " + sourceDir);

    return new Promise<any>((resolve, reject) => {
      let output  = fs.createWriteStream(bundlePath);
      let archive = archiver('tar', {
        gzip: true,
        gzipOptions: gzipOptions
      });
      archive.pipe(output);
      output.once('close', () => {
        this.emit('archive.finished', { message: "Bundle file is archived.", bundlePath, buildLocation });
        this.emit('finished', { message: "Build finished", bundlePath, buildLocation });
        resolve();
      });
      archive.once('error', (err) => {
        console.log("=> Archiving failed:", err.message);
        this.emit('fail', { message: err.message, error: err, bundlePath, buildLocation });
        reject(err);
      });
      archive.directory(sourceDir, 'bundle').finalize();
    });
  }

  protected meteorCommand(appPath : string, executable : string, args : Array<string>) : Promise<number> {
    const isWin = /^win/.test(process.platform);
    if (isWin) {
      // Sometimes cmd.exe not available in the path
      // See: http://goo.gl/ADmzoD
      executable = process.env.comspec || "cmd.exe";
      args = ["/c", "meteor"].concat(args);
    }

    let options = {
      "cwd": pathResolve(appPath),
    };
    options['env'] = process.env;
    if (this.config.meteor.env) {
      options['env'] = _.extend(options['env'], this.config.meteor.env);
    }

    this.log(`Running meteor command: ${executable} ${args.join(' ')}`);
    return new Promise<number>( (resolve, reject) => {
      let meteor = spawn(executable, args, options);
      let stdout = "";
      let stderr = "";
      meteor.stdout.pipe(process.stdout, {end: false});
      meteor.stderr.pipe(process.stderr, {end: false});
      meteor.on('close', (code : number) => {
        if (code != 0) {
          return reject(code);
        }
        resolve(code);
      });
    });
  }

  protected normalCommand(appPath : string, executable : string, args : Array<string>) : Promise<number> {
    const isWin = /^win/.test(process.platform);
    if (isWin) {
      // Sometimes cmd.exe not available in the path
      // See: http://goo.gl/ADmzoD
      executable = process.env.comspec || "cmd.exe";
      args = ["/c"].concat(args);
    }

    let options = {
      "cwd": pathResolve(appPath),
    };
    options['env'] = process.env;
    if (this.config.meteor.env) {
      options['env'] = _.extend(options['env'], this.config.meteor.env);
    }

    this.log(`Running command: ${executable} ${args.join(' ')}`);
    return new Promise<number>( (resolve, reject) => {
      let meteor = spawn(executable, args, options);
      let stdout = "";
      let stderr = "";
      meteor.stdout.pipe(process.stdout, {end: false});
      meteor.stderr.pipe(process.stderr, {end: false});
      meteor.on('close', (code : number) => {
        if (code != 0) {
          return reject(code);
        }
        resolve(code);
      });
    });
  }

  protected buildMeteorApp(appPath : string, executable : string, buildLocation : string) : Promise<number> {
    let args : Array<string> = [ "build", "--directory", buildLocation ];
    if (this.config.build.architecture || this.config.build.arch) {
      args.push("--architecture", this.config.build.architecture || this.config.build.arch);
    }
    if (this.config.build.server) {
      args.push("--server", this.config.build.server);
    }
    
    let isWin = /^win/.test(process.platform);
    if (isWin) {
      // Sometimes cmd.exe not available in the path
      // See: http://goo.gl/ADmzoD
      executable = process.env.comspec || "cmd.exe";
      args = ["/c", "meteor"].concat(args);
    }

    let options = {
      "cwd": pathResolve(appPath),
    };

    options['env'] = process.env;
    if (this.config.meteor.env) {
      options['env'] = _.extend(options['env'], this.config.meteor.env);
    }
    options['env']['BUILD_LOCATION'] = buildLocation;

    this.log(`Building: ${executable} ${args.join(' ')}`);

    return new Promise<number>( (resolve, reject) => {
      let meteor = spawn(executable, args, options);
      let stdout = "";
      let stderr = "";
      meteor.stdout.pipe(process.stdout, {end: false});
      meteor.stderr.pipe(process.stderr, {end: false});
      meteor.on('close', (code : number) => {
        if (code != 0) {
          return reject(code);
        }
        resolve(code);
      });
    });
  }





  protected error(a : any) {
    let message = a;
    let err = null;
    if (a instanceof Error) {
      err = a;
      message = a.message;
    }
    this.emit('error', message, err);
    console.error(message, err);
  }

  protected debug(a : any) {
    let message = a;
    if (typeof a === "object") {
      message = JSON.stringify(a, null, "  ");
    }
    this.emit('debug', message);
    console.log(message);
  }

  protected log(message : string) {
    this.emit('log', message);
    console.log(message);
  }

  protected progress(message : string) {
    this.emit('progress', message);
    console.log(message);
  }
}

