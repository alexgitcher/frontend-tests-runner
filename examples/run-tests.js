if (process.argv.length !== 3) {
  console.log("Usage: node run-tests.js <config>");
}

const webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const Runner = require('funbox-frontend-tests-runner');

const config = require(path.resolve(process.argv[2]));
const webpackConfig = require(path.resolve(__dirname, '../webpack.app.test.js'));

const project = new EventEmitter();

let resolveInitialBuild;

// Проброс параметров запуска phantomjs через переменную окружения
process.env.BROWSER_ARGS = JSON.stringify(config.browserArgs);

project.build = () => {
  if (config.live) {
    setBaseUrl();
    return isPortFree(webpackConfig.devServer.port).then((isFree) => {
      if (isFree) {
        return build();
      } else {
        return Promise.resolve();
      }
    });
  } else {
    return findFreePort(webpackConfig.devServer.port).then((port) => {
      console.log(`Free port found: ${port}`);
      webpackConfig.devServer.port = port;
      setBaseUrl();
      return build();
    });
  }
}

function setBaseUrl() {
  // Пробрасываем ENV-переменную BASE_URL для того, чтобы e2e тесты знали адрес проверяемого приложения
  process.env.BASE_URL = 'http://localhost:' + webpackConfig.devServer.port;
  console.log(`BASE_URL: ${process.env.BASE_URL}`);
}

// В данном примере для реализации работы live-режима использует плагин funbox-rebuild-in-progress-webpack-plugin
const rebuildInProgressFile = path.resolve(__dirname, '../../node_modules/.rebuildInProgress');

fs.watch(path.dirname(rebuildInProgressFile), (eventType, filename) => {
  if (eventType === 'rename' && filename === path.basename(rebuildInProgressFile)) {
    if (fs.existsSync(rebuildInProgressFile)) {
      project.emit('buildStart');
    } else {
      if (resolveInitialBuild) {
        resolveInitialBuild();
        resolveInitialBuild = null;
      }
      project.emit('buildFinish');
    }
  }
});

config.project = project;

const runner = new Runner(config);
runner.start();

function build() {
  return new Promise((resolve, reject) => {
    // В данном примере в качестве средства сборки в проекте используется webpack
    new WebpackDevServer(webpack(webpackConfig), webpackConfig.devServer).listen(webpackConfig.devServer.port, 'localhost', (err) => {
      if (err) {
        console.log('Ошибка сборки: ' + err);
        process.exit(1);
      }

      resolveInitialBuild = resolve;
    });
  });
}

function findFreePort(port) {
  return isPortFree(port).then((isFree) => {
    if (isFree) {
      return port;
    }
    return findFreePort(port + 1);
  });
}

function isPortFree(port) {
  return new Promise((resolve, reject) => {
    const net = require('net');
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        throw err;
      }
    });
    server.once('listening', () => {
      server.once('close', () => {
        resolve(true);
      });
      server.close();
    });
    server.listen(port, '0.0.0.0');
  });
}