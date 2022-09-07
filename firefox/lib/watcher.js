"use strict";

class DownloadWatcher {

    constructor() {
        this.enabled = false;
        this.logger = new Logger();
        this.blockedHosts = [];
        this.fileExts = [];
    }

    getActionIconName(icon) {
        return this.enabled ? icon + ".png" : icon + "-mono.png";
    }

    getActionIcon() {
        return {
            "16": this.getActionIconName("icon16"),
            "48": this.getActionIconName("icon48"),
            "128": this.getActionIconName("icon128")
        }
    }

    onDownloadCreated(download) {
        this.logger.log("onDownloadCreated");
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

    updateActionIcon() {
        chrome.browserAction.setIcon({ path: this.getActionIcon() });
    }

    onMessage(msg) {
        this.logger.log(msg);
        this.enabled = msg.enabled;
        this.fileExts = msg.fileExts;
        this.blockedHosts = msg.blockedHosts;
        this.updateActionIcon();
    }

    onDisconnect(p) {
        this.logger.log("Disconnected.");
        this.enabled = false;
        this.port = undefined;
        this.updateActionIcon();
    }

    startNativeHost() {
        this.port = browser.runtime.connectNative("xdmff.native_host");
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
        this.startNativeHost();
        this.logger.log("started.");
        chrome.browserAction.onClicked.addListener(this.actionClicked.bind(this));
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
				this.logger.log(data);
                nativePort.postMessage(data);
            }
        });
    }

    diconnect() {
        this.port && this.port.disconnect();
        this.onDisconnect();
    }
}
