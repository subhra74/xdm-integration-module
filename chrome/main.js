"use strict";
import Logger from './lib/logger.js';

export default class DownloadWatcher {

    constructor() {
        this.enabled = false;
        this.logger = new Logger();
        this.blockedHosts = [];
        this.fileExts = [];
    }

    onDeterminingFilename(download, suggest) {
        this.logger.log("onDeterminingFilename");
        this.logger.log(download);
        let url = download.finalUrl || download.url;
        this.logger.log(url);
        if (this.enabled && this.shouldTakeOver(url, download.filename)) {
            chrome.downloads.cancel(
                download.id
            );
            this.triggerDownload(download.url, download.filename,
                download.referrer, download.fileSize, download.mime);
        }
    }

    onDownloadCreated(download) {
        this.logger.log("onDownloadCreated");
        this.logger.log(download);
    }

    onMessage(msg) {
        this.logger.log(msg);
        this.enabled = msg.enabled;
        this.fileExts = msg.fileExts;
        this.blockedHosts = msg.blockedHosts;
    }

    onDisconnect() {
        this.logger.log("Disconnected.");
        this.enabled = false;
        this.port = undefined;
    }

    startNativeHost() {
        this.port = chrome.runtime.connectNative("xdm_chrome.native_host");
        this.port.onMessage.addListener(this.onMessage.bind(this));
        this.port.onDisconnect.addListener(this.onDisconnect.bind(this));
    }

    actionClicked(tab) {
        if (!this.enabled) {
            if (!this.port) {
                this.startNativeHost();
            }
        } else {
            this.diconnect();
        }
    }

    start() {
        this.logger.log("starting...");
        chrome.downloads.onCreated.addListener(
            this.onDownloadCreated.bind(this)
        );
        chrome.downloads.onDeterminingFilename.addListener(
            this.onDeterminingFilename.bind(this)
        );
        this.startNativeHost();
        this.logger.log("started.");
        chrome.action.onClicked.addListener(this.actionClicked.bind(this));
    }

    shouldTakeOver(url, file) {
        let u = new URL(url);
        let hostName = u.host;
        if (this.blockedHosts.find(item => hostName.indexOf(item) >= 0)) {
            return false;
        }
        let path = file || u.pathname;
        let upath = path.toUpperCase();
        if (this.fileExts.find(ext => upath.endsWith(ext))) {
            return true;
        }
        return false;
    }

    triggerDownload(url, file, referer, size, mime) {
        let nativePort = this.port;
        chrome.cookies.getAll({ "url": url }, cookies => {
            if (cookies) {
                let cookieStr = cookies.map(cookie => cookie.name + "=" + cookie.value).join("; ");
                let headers = ["User-Agent: " + navigator.userAgent];
                if (referer) {
                    headers.push("Referer: " + referer);
                }
                let data = {
                    url: url,
                    cookie: cookieStr,
                    headers: headers,
                    filename: file,
                    fileSize: size,
                    mimeType: mime
                };
                console.log(data);
                nativePort.postMessage(data);
            }
        });
    }

    diconnect() {
        console.log(this.port);
        this.port && this.port.disconnect();
        this.onDisconnect();
    }
}

const watcher = new DownloadWatcher();
watcher.start();