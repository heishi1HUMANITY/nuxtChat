exports.ids = [1];
exports.modules = Array(32).concat([
/* 32 */
/***/ (function(module, exports, __webpack_require__) {

const encodePacket = __webpack_require__(50);
const decodePacket = __webpack_require__(51);

const SEPARATOR = String.fromCharCode(30); // see https://en.wikipedia.org/wiki/Delimiter#ASCII_delimited_text

const encodePayload = (packets, callback) => {
  // some packets may be added to the array while encoding, so the initial length must be saved
  const length = packets.length;
  const encodedPackets = new Array(length);
  let count = 0;

  packets.forEach((packet, i) => {
    // force base64 encoding for binary packets
    encodePacket(packet, false, encodedPacket => {
      encodedPackets[i] = encodedPacket;
      if (++count === length) {
        callback(encodedPackets.join(SEPARATOR));
      }
    });
  });
};

const decodePayload = (encodedPayload, binaryType) => {
  const encodedPackets = encodedPayload.split(SEPARATOR);
  const packets = [];
  for (let i = 0; i < encodedPackets.length; i++) {
    const decodedPacket = decodePacket(encodedPackets[i], binaryType);
    packets.push(decodedPacket);
    if (decodedPacket.type === "error") {
      break;
    }
  }
  return packets;
};

module.exports = {
  protocol: 4,
  encodePacket,
  encodePayload,
  decodePacket,
  decodePayload
};


/***/ }),
/* 33 */
/***/ (function(module, exports, __webpack_require__) {

const parser = __webpack_require__(32);
const Emitter = __webpack_require__(24);

class Transport extends Emitter {
  /**
   * Transport abstract constructor.
   *
   * @param {Object} options.
   * @api private
   */
  constructor(opts) {
    super();

    this.opts = opts;
    this.query = opts.query;
    this.readyState = "";
    this.socket = opts.socket;
  }

  /**
   * Emits an error.
   *
   * @param {String} str
   * @return {Transport} for chaining
   * @api public
   */
  onError(msg, desc) {
    const err = new Error(msg);
    err.type = "TransportError";
    err.description = desc;
    this.emit("error", err);
    return this;
  }

  /**
   * Opens the transport.
   *
   * @api public
   */
  open() {
    if ("closed" === this.readyState || "" === this.readyState) {
      this.readyState = "opening";
      this.doOpen();
    }

    return this;
  }

  /**
   * Closes the transport.
   *
   * @api private
   */
  close() {
    if ("opening" === this.readyState || "open" === this.readyState) {
      this.doClose();
      this.onClose();
    }

    return this;
  }

  /**
   * Sends multiple packets.
   *
   * @param {Array} packets
   * @api private
   */
  send(packets) {
    if ("open" === this.readyState) {
      this.write(packets);
    } else {
      throw new Error("Transport not open");
    }
  }

  /**
   * Called upon open
   *
   * @api private
   */
  onOpen() {
    this.readyState = "open";
    this.writable = true;
    this.emit("open");
  }

  /**
   * Called with data.
   *
   * @param {String} data
   * @api private
   */
  onData(data) {
    const packet = parser.decodePacket(data, this.socket.binaryType);
    this.onPacket(packet);
  }

  /**
   * Called with a decoded packet.
   */
  onPacket(packet) {
    this.emit("packet", packet);
  }

  /**
   * Called upon close.
   *
   * @api private
   */
  onClose() {
    this.readyState = "closed";
    this.emit("close");
  }
}

module.exports = Transport;


/***/ }),
/* 34 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.Decoder = exports.Encoder = exports.PacketType = exports.protocol = void 0;
const Emitter = __webpack_require__(24);
const binary_1 = __webpack_require__(55);
const is_binary_1 = __webpack_require__(42);
const debug = __webpack_require__(23)("socket.io-parser");
/**
 * Protocol version.
 *
 * @public
 */
exports.protocol = 5;
var PacketType;
(function (PacketType) {
    PacketType[PacketType["CONNECT"] = 0] = "CONNECT";
    PacketType[PacketType["DISCONNECT"] = 1] = "DISCONNECT";
    PacketType[PacketType["EVENT"] = 2] = "EVENT";
    PacketType[PacketType["ACK"] = 3] = "ACK";
    PacketType[PacketType["CONNECT_ERROR"] = 4] = "CONNECT_ERROR";
    PacketType[PacketType["BINARY_EVENT"] = 5] = "BINARY_EVENT";
    PacketType[PacketType["BINARY_ACK"] = 6] = "BINARY_ACK";
})(PacketType = exports.PacketType || (exports.PacketType = {}));
/**
 * A socket.io Encoder instance
 */
class Encoder {
    /**
     * Encode a packet as a single string if non-binary, or as a
     * buffer sequence, depending on packet type.
     *
     * @param {Object} obj - packet object
     */
    encode(obj) {
        debug("encoding packet %j", obj);
        if (obj.type === PacketType.EVENT || obj.type === PacketType.ACK) {
            if (is_binary_1.hasBinary(obj)) {
                obj.type =
                    obj.type === PacketType.EVENT
                        ? PacketType.BINARY_EVENT
                        : PacketType.BINARY_ACK;
                return this.encodeAsBinary(obj);
            }
        }
        return [this.encodeAsString(obj)];
    }
    /**
     * Encode packet as string.
     */
    encodeAsString(obj) {
        // first is type
        let str = "" + obj.type;
        // attachments if we have them
        if (obj.type === PacketType.BINARY_EVENT ||
            obj.type === PacketType.BINARY_ACK) {
            str += obj.attachments + "-";
        }
        // if we have a namespace other than `/`
        // we append it followed by a comma `,`
        if (obj.nsp && "/" !== obj.nsp) {
            str += obj.nsp + ",";
        }
        // immediately followed by the id
        if (null != obj.id) {
            str += obj.id;
        }
        // json data
        if (null != obj.data) {
            str += JSON.stringify(obj.data);
        }
        debug("encoded %j as %s", obj, str);
        return str;
    }
    /**
     * Encode packet as 'buffer sequence' by removing blobs, and
     * deconstructing packet into object with placeholders and
     * a list of buffers.
     */
    encodeAsBinary(obj) {
        const deconstruction = binary_1.deconstructPacket(obj);
        const pack = this.encodeAsString(deconstruction.packet);
        const buffers = deconstruction.buffers;
        buffers.unshift(pack); // add packet info to beginning of data list
        return buffers; // write all the buffers
    }
}
exports.Encoder = Encoder;
/**
 * A socket.io Decoder instance
 *
 * @return {Object} decoder
 */
class Decoder extends Emitter {
    constructor() {
        super();
    }
    /**
     * Decodes an encoded packet string into packet JSON.
     *
     * @param {String} obj - encoded packet
     */
    add(obj) {
        let packet;
        if (typeof obj === "string") {
            packet = this.decodeString(obj);
            if (packet.type === PacketType.BINARY_EVENT ||
                packet.type === PacketType.BINARY_ACK) {
                // binary packet's json
                this.reconstructor = new BinaryReconstructor(packet);
                // no attachments, labeled binary but no binary data to follow
                if (packet.attachments === 0) {
                    super.emit("decoded", packet);
                }
            }
            else {
                // non-binary full packet
                super.emit("decoded", packet);
            }
        }
        else if (is_binary_1.isBinary(obj) || obj.base64) {
            // raw binary data
            if (!this.reconstructor) {
                throw new Error("got binary data when not reconstructing a packet");
            }
            else {
                packet = this.reconstructor.takeBinaryData(obj);
                if (packet) {
                    // received final buffer
                    this.reconstructor = null;
                    super.emit("decoded", packet);
                }
            }
        }
        else {
            throw new Error("Unknown type: " + obj);
        }
    }
    /**
     * Decode a packet String (JSON data)
     *
     * @param {String} str
     * @return {Object} packet
     */
    decodeString(str) {
        let i = 0;
        // look up type
        const p = {
            type: Number(str.charAt(0)),
        };
        if (PacketType[p.type] === undefined) {
            throw new Error("unknown packet type " + p.type);
        }
        // look up attachments if type binary
        if (p.type === PacketType.BINARY_EVENT ||
            p.type === PacketType.BINARY_ACK) {
            const start = i + 1;
            while (str.charAt(++i) !== "-" && i != str.length) { }
            const buf = str.substring(start, i);
            if (buf != Number(buf) || str.charAt(i) !== "-") {
                throw new Error("Illegal attachments");
            }
            p.attachments = Number(buf);
        }
        // look up namespace (if any)
        if ("/" === str.charAt(i + 1)) {
            const start = i + 1;
            while (++i) {
                const c = str.charAt(i);
                if ("," === c)
                    break;
                if (i === str.length)
                    break;
            }
            p.nsp = str.substring(start, i);
        }
        else {
            p.nsp = "/";
        }
        // look up id
        const next = str.charAt(i + 1);
        if ("" !== next && Number(next) == next) {
            const start = i + 1;
            while (++i) {
                const c = str.charAt(i);
                if (null == c || Number(c) != c) {
                    --i;
                    break;
                }
                if (i === str.length)
                    break;
            }
            p.id = Number(str.substring(start, i + 1));
        }
        // look up json data
        if (str.charAt(++i)) {
            const payload = tryParse(str.substr(i));
            if (Decoder.isPayloadValid(p.type, payload)) {
                p.data = payload;
            }
            else {
                throw new Error("invalid payload");
            }
        }
        debug("decoded %s as %j", str, p);
        return p;
    }
    static isPayloadValid(type, payload) {
        switch (type) {
            case PacketType.CONNECT:
                return typeof payload === "object";
            case PacketType.DISCONNECT:
                return payload === undefined;
            case PacketType.CONNECT_ERROR:
                return typeof payload === "string" || typeof payload === "object";
            case PacketType.EVENT:
            case PacketType.BINARY_EVENT:
                return Array.isArray(payload) && typeof payload[0] === "string";
            case PacketType.ACK:
            case PacketType.BINARY_ACK:
                return Array.isArray(payload);
        }
    }
    /**
     * Deallocates a parser's resources
     */
    destroy() {
        if (this.reconstructor) {
            this.reconstructor.finishedReconstruction();
        }
    }
}
exports.Decoder = Decoder;
function tryParse(str) {
    try {
        return JSON.parse(str);
    }
    catch (e) {
        return false;
    }
}
/**
 * A manager of a binary event's 'buffer sequence'. Should
 * be constructed whenever a packet of type BINARY_EVENT is
 * decoded.
 *
 * @param {Object} packet
 * @return {BinaryReconstructor} initialized reconstructor
 */
class BinaryReconstructor {
    constructor(packet) {
        this.packet = packet;
        this.buffers = [];
        this.reconPack = packet;
    }
    /**
     * Method to be called when binary data received from connection
     * after a BINARY_EVENT packet.
     *
     * @param {Buffer | ArrayBuffer} binData - the raw binary data received
     * @return {null | Object} returns null if more binary data is expected or
     *   a reconstructed packet object if all buffers have been received.
     */
    takeBinaryData(binData) {
        this.buffers.push(binData);
        if (this.buffers.length === this.reconPack.attachments) {
            // done with buffer list
            const packet = binary_1.reconstructPacket(this.reconPack, this.buffers);
            this.finishedReconstruction();
            return packet;
        }
        return null;
    }
    /**
     * Cleans up binary packet reconstruction variables.
     */
    finishedReconstruction() {
        this.reconPack = null;
        this.buffers = [];
    }
}


/***/ }),
/* 35 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.Manager = void 0;
const eio = __webpack_require__(47);
const socket_1 = __webpack_require__(41);
const Emitter = __webpack_require__(24);
const parser = __webpack_require__(34);
const on_1 = __webpack_require__(43);
const bind = __webpack_require__(29);
const Backoff = __webpack_require__(31);
const debug = __webpack_require__(23)("socket.io-client:manager");
class Manager extends Emitter {
    constructor(uri, opts) {
        super();
        this.nsps = {};
        this.subs = [];
        if (uri && "object" === typeof uri) {
            opts = uri;
            uri = undefined;
        }
        opts = opts || {};
        opts.path = opts.path || "/socket.io";
        this.opts = opts;
        this.reconnection(opts.reconnection !== false);
        this.reconnectionAttempts(opts.reconnectionAttempts || Infinity);
        this.reconnectionDelay(opts.reconnectionDelay || 1000);
        this.reconnectionDelayMax(opts.reconnectionDelayMax || 5000);
        this.randomizationFactor(opts.randomizationFactor || 0.5);
        this.backoff = new Backoff({
            min: this.reconnectionDelay(),
            max: this.reconnectionDelayMax(),
            jitter: this.randomizationFactor(),
        });
        this.timeout(null == opts.timeout ? 20000 : opts.timeout);
        this._readyState = "closed";
        this.uri = uri;
        const _parser = opts.parser || parser;
        this.encoder = new _parser.Encoder();
        this.decoder = new _parser.Decoder();
        this._autoConnect = opts.autoConnect !== false;
        if (this._autoConnect)
            this.open();
    }
    reconnection(v) {
        if (!arguments.length)
            return this._reconnection;
        this._reconnection = !!v;
        return this;
    }
    reconnectionAttempts(v) {
        if (v === undefined)
            return this._reconnectionAttempts;
        this._reconnectionAttempts = v;
        return this;
    }
    reconnectionDelay(v) {
        var _a;
        if (v === undefined)
            return this._reconnectionDelay;
        this._reconnectionDelay = v;
        (_a = this.backoff) === null || _a === void 0 ? void 0 : _a.setMin(v);
        return this;
    }
    randomizationFactor(v) {
        var _a;
        if (v === undefined)
            return this._randomizationFactor;
        this._randomizationFactor = v;
        (_a = this.backoff) === null || _a === void 0 ? void 0 : _a.setJitter(v);
        return this;
    }
    reconnectionDelayMax(v) {
        var _a;
        if (v === undefined)
            return this._reconnectionDelayMax;
        this._reconnectionDelayMax = v;
        (_a = this.backoff) === null || _a === void 0 ? void 0 : _a.setMax(v);
        return this;
    }
    timeout(v) {
        if (!arguments.length)
            return this._timeout;
        this._timeout = v;
        return this;
    }
    /**
     * Starts trying to reconnect if reconnection is enabled and we have not
     * started reconnecting yet
     *
     * @private
     */
    maybeReconnectOnOpen() {
        // Only try to reconnect if it's the first time we're connecting
        if (!this._reconnecting &&
            this._reconnection &&
            this.backoff.attempts === 0) {
            // keeps reconnection from firing twice for the same reconnection loop
            this.reconnect();
        }
    }
    /**
     * Sets the current transport `socket`.
     *
     * @param {Function} fn - optional, callback
     * @return self
     * @public
     */
    open(fn) {
        debug("readyState %s", this._readyState);
        if (~this._readyState.indexOf("open"))
            return this;
        debug("opening %s", this.uri);
        this.engine = eio(this.uri, this.opts);
        const socket = this.engine;
        const self = this;
        this._readyState = "opening";
        this.skipReconnect = false;
        // emit `open`
        const openSub = on_1.on(socket, "open", function () {
            self.onopen();
            fn && fn();
        });
        // emit `error`
        const errorSub = on_1.on(socket, "error", (err) => {
            debug("error");
            self.cleanup();
            self._readyState = "closed";
            super.emit("error", err);
            if (fn) {
                fn(err);
            }
            else {
                // Only do this if there is no fn to handle the error
                self.maybeReconnectOnOpen();
            }
        });
        if (false !== this._timeout) {
            const timeout = this._timeout;
            debug("connect attempt will timeout after %d", timeout);
            if (timeout === 0) {
                openSub.destroy(); // prevents a race condition with the 'open' event
            }
            // set timer
            const timer = setTimeout(() => {
                debug("connect attempt timed out after %d", timeout);
                openSub.destroy();
                socket.close();
                socket.emit("error", new Error("timeout"));
            }, timeout);
            this.subs.push({
                destroy: function () {
                    clearTimeout(timer);
                },
            });
        }
        this.subs.push(openSub);
        this.subs.push(errorSub);
        return this;
    }
    /**
     * Alias for open()
     *
     * @return {Manager} self
     * @public
     */
    connect(fn) {
        return this.open(fn);
    }
    /**
     * Called upon transport open.
     *
     * @private
     */
    onopen() {
        debug("open");
        // clear old subs
        this.cleanup();
        // mark as open
        this._readyState = "open";
        super.emit("open");
        // add new subs
        const socket = this.engine;
        this.subs.push(on_1.on(socket, "data", bind(this, "ondata")), on_1.on(socket, "ping", bind(this, "onping")), on_1.on(socket, "error", bind(this, "onerror")), on_1.on(socket, "close", bind(this, "onclose")), on_1.on(this.decoder, "decoded", bind(this, "ondecoded")));
    }
    /**
     * Called upon a ping.
     *
     * @private
     */
    onping() {
        super.emit("ping");
    }
    /**
     * Called with data.
     *
     * @private
     */
    ondata(data) {
        this.decoder.add(data);
    }
    /**
     * Called when parser fully decodes a packet.
     *
     * @private
     */
    ondecoded(packet) {
        super.emit("packet", packet);
    }
    /**
     * Called upon socket error.
     *
     * @private
     */
    onerror(err) {
        debug("error", err);
        super.emit("error", err);
    }
    /**
     * Creates a new socket for the given `nsp`.
     *
     * @return {Socket}
     * @public
     */
    socket(nsp, opts) {
        let socket = this.nsps[nsp];
        if (!socket) {
            socket = new socket_1.Socket(this, nsp, opts);
            this.nsps[nsp] = socket;
        }
        return socket;
    }
    /**
     * Called upon a socket close.
     *
     * @param socket
     * @private
     */
    _destroy(socket) {
        const nsps = Object.keys(this.nsps);
        for (const nsp of nsps) {
            const socket = this.nsps[nsp];
            if (socket.active) {
                debug("socket %s is still active, skipping close", nsp);
                return;
            }
        }
        this._close();
    }
    /**
     * Writes a packet.
     *
     * @param packet
     * @private
     */
    _packet(packet) {
        debug("writing packet %j", packet);
        if (packet.query && packet.type === 0)
            packet.nsp += "?" + packet.query;
        const encodedPackets = this.encoder.encode(packet);
        for (let i = 0; i < encodedPackets.length; i++) {
            this.engine.write(encodedPackets[i], packet.options);
        }
    }
    /**
     * Clean up transport subscriptions and packet buffer.
     *
     * @private
     */
    cleanup() {
        debug("cleanup");
        const subsLength = this.subs.length;
        for (let i = 0; i < subsLength; i++) {
            const sub = this.subs.shift();
            sub.destroy();
        }
        this.decoder.destroy();
    }
    /**
     * Close the current socket.
     *
     * @private
     */
    _close() {
        debug("disconnect");
        this.skipReconnect = true;
        this._reconnecting = false;
        if ("opening" === this._readyState) {
            // `onclose` will not fire because
            // an open event never happened
            this.cleanup();
        }
        this.backoff.reset();
        this._readyState = "closed";
        if (this.engine)
            this.engine.close();
    }
    /**
     * Alias for close()
     *
     * @private
     */
    disconnect() {
        return this._close();
    }
    /**
     * Called upon engine close.
     *
     * @private
     */
    onclose(reason) {
        debug("onclose");
        this.cleanup();
        this.backoff.reset();
        this._readyState = "closed";
        super.emit("close", reason);
        if (this._reconnection && !this.skipReconnect) {
            this.reconnect();
        }
    }
    /**
     * Attempt a reconnection.
     *
     * @private
     */
    reconnect() {
        if (this._reconnecting || this.skipReconnect)
            return this;
        const self = this;
        if (this.backoff.attempts >= this._reconnectionAttempts) {
            debug("reconnect failed");
            this.backoff.reset();
            super.emit("reconnect_failed");
            this._reconnecting = false;
        }
        else {
            const delay = this.backoff.duration();
            debug("will wait %dms before reconnect attempt", delay);
            this._reconnecting = true;
            const timer = setTimeout(() => {
                if (self.skipReconnect)
                    return;
                debug("attempting reconnect");
                super.emit("reconnect_attempt", self.backoff.attempts);
                // check again for the case socket closed in above events
                if (self.skipReconnect)
                    return;
                self.open((err) => {
                    if (err) {
                        debug("reconnect attempt error");
                        self._reconnecting = false;
                        self.reconnect();
                        super.emit("reconnect_error", err);
                    }
                    else {
                        debug("reconnect success");
                        self.onreconnect();
                    }
                });
            }, delay);
            this.subs.push({
                destroy: function () {
                    clearTimeout(timer);
                },
            });
        }
    }
    /**
     * Called upon successful reconnect.
     *
     * @private
     */
    onreconnect() {
        const attempt = this.backoff.attempts;
        this._reconnecting = false;
        this.backoff.reset();
        super.emit("reconnect", attempt);
    }
}
exports.Manager = Manager;


/***/ }),
/* 36 */
/***/ (function(module, exports, __webpack_require__) {

const XMLHttpRequest = __webpack_require__(27);
const XHR = __webpack_require__(49);
const JSONP = __webpack_require__(52);
const websocket = __webpack_require__(53);

exports.polling = polling;
exports.websocket = websocket;

/**
 * Polling transport polymorphic constructor.
 * Decides on xhr vs jsonp based on feature detection.
 *
 * @api private
 */

function polling(opts) {
  let xhr;
  let xd = false;
  let xs = false;
  const jsonp = false !== opts.jsonp;

  if (typeof location !== "undefined") {
    const isSSL = "https:" === location.protocol;
    let port = location.port;

    // some user agents have empty `location.port`
    if (!port) {
      port = isSSL ? 443 : 80;
    }

    xd = opts.hostname !== location.hostname || port !== opts.port;
    xs = opts.secure !== isSSL;
  }

  opts.xdomain = xd;
  opts.xscheme = xs;
  xhr = new XMLHttpRequest(opts);

  if ("open" in xhr && !opts.forceJSONP) {
    return new XHR(opts);
  } else {
    if (!jsonp) throw new Error("JSONP disabled");
    return new JSONP(opts);
  }
}


/***/ }),
/* 37 */
/***/ (function(module, exports, __webpack_require__) {

const Transport = __webpack_require__(33);
const parseqs = __webpack_require__(25);
const parser = __webpack_require__(32);
const yeast = __webpack_require__(28);

const debug = __webpack_require__(23)("engine.io-client:polling");

class Polling extends Transport {
  /**
   * Transport name.
   */
  get name() {
    return "polling";
  }

  /**
   * Opens the socket (triggers polling). We write a PING message to determine
   * when the transport is open.
   *
   * @api private
   */
  doOpen() {
    this.poll();
  }

  /**
   * Pauses polling.
   *
   * @param {Function} callback upon buffers are flushed and transport is paused
   * @api private
   */
  pause(onPause) {
    const self = this;

    this.readyState = "pausing";

    function pause() {
      debug("paused");
      self.readyState = "paused";
      onPause();
    }

    if (this.polling || !this.writable) {
      let total = 0;

      if (this.polling) {
        debug("we are currently polling - waiting to pause");
        total++;
        this.once("pollComplete", function() {
          debug("pre-pause polling complete");
          --total || pause();
        });
      }

      if (!this.writable) {
        debug("we are currently writing - waiting to pause");
        total++;
        this.once("drain", function() {
          debug("pre-pause writing complete");
          --total || pause();
        });
      }
    } else {
      pause();
    }
  }

  /**
   * Starts polling cycle.
   *
   * @api public
   */
  poll() {
    debug("polling");
    this.polling = true;
    this.doPoll();
    this.emit("poll");
  }

  /**
   * Overloads onData to detect payloads.
   *
   * @api private
   */
  onData(data) {
    const self = this;
    debug("polling got data %s", data);
    const callback = function(packet, index, total) {
      // if its the first message we consider the transport open
      if ("opening" === self.readyState && packet.type === "open") {
        self.onOpen();
      }

      // if its a close packet, we close the ongoing requests
      if ("close" === packet.type) {
        self.onClose();
        return false;
      }

      // otherwise bypass onData and handle the message
      self.onPacket(packet);
    };

    // decode payload
    parser.decodePayload(data, this.socket.binaryType).forEach(callback);

    // if an event did not trigger closing
    if ("closed" !== this.readyState) {
      // if we got data we're not polling
      this.polling = false;
      this.emit("pollComplete");

      if ("open" === this.readyState) {
        this.poll();
      } else {
        debug('ignoring poll - transport state "%s"', this.readyState);
      }
    }
  }

  /**
   * For polling, send a close packet.
   *
   * @api private
   */
  doClose() {
    const self = this;

    function close() {
      debug("writing close packet");
      self.write([{ type: "close" }]);
    }

    if ("open" === this.readyState) {
      debug("transport open - closing");
      close();
    } else {
      // in case we're trying to close while
      // handshaking is in progress (GH-164)
      debug("transport not open - deferring close");
      this.once("open", close);
    }
  }

  /**
   * Writes a packets payload.
   *
   * @param {Array} data packets
   * @param {Function} drain callback
   * @api private
   */
  write(packets) {
    this.writable = false;

    parser.encodePayload(packets, data => {
      this.doWrite(data, () => {
        this.writable = true;
        this.emit("drain");
      });
    });
  }

  /**
   * Generates uri for connection.
   *
   * @api private
   */
  uri() {
    let query = this.query || {};
    const schema = this.opts.secure ? "https" : "http";
    let port = "";

    // cache busting is forced
    if (false !== this.opts.timestampRequests) {
      query[this.opts.timestampParam] = yeast();
    }

    if (!this.supportsBinary && !query.sid) {
      query.b64 = 1;
    }

    query = parseqs.encode(query);

    // avoid port if default for schema
    if (
      this.opts.port &&
      (("https" === schema && Number(this.opts.port) !== 443) ||
        ("http" === schema && Number(this.opts.port) !== 80))
    ) {
      port = ":" + this.opts.port;
    }

    // prepend ? to query
    if (query.length) {
      query = "?" + query;
    }

    const ipv6 = this.opts.hostname.indexOf(":") !== -1;
    return (
      schema +
      "://" +
      (ipv6 ? "[" + this.opts.hostname + "]" : this.opts.hostname) +
      port +
      this.opts.path +
      query
    );
  }
}

module.exports = Polling;


/***/ }),
/* 38 */
/***/ (function(module, exports) {

const PACKET_TYPES = Object.create(null); // no Map = no polyfill
PACKET_TYPES["open"] = "0";
PACKET_TYPES["close"] = "1";
PACKET_TYPES["ping"] = "2";
PACKET_TYPES["pong"] = "3";
PACKET_TYPES["message"] = "4";
PACKET_TYPES["upgrade"] = "5";
PACKET_TYPES["noop"] = "6";

const PACKET_TYPES_REVERSE = Object.create(null);
Object.keys(PACKET_TYPES).forEach(key => {
  PACKET_TYPES_REVERSE[PACKET_TYPES[key]] = key;
});

const ERROR_PACKET = { type: "error", data: "parser error" };

module.exports = {
  PACKET_TYPES,
  PACKET_TYPES_REVERSE,
  ERROR_PACKET
};


/***/ }),
/* 39 */
/***/ (function(module, exports) {

module.exports.pick = (obj, ...attr) => {
  return attr.reduce((acc, k) => {
    acc[k] = obj[k];
    return acc;
  }, {});
};


/***/ }),
/* 40 */
/***/ (function(module, exports) {

module.exports = global;


/***/ }),
/* 41 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.Socket = void 0;
const socket_io_parser_1 = __webpack_require__(34);
const Emitter = __webpack_require__(24);
const on_1 = __webpack_require__(43);
const bind = __webpack_require__(29);
const debug = __webpack_require__(23)("socket.io-client:socket");
/**
 * Internal events.
 * These events can't be emitted by the user.
 */
const RESERVED_EVENTS = Object.freeze({
    connect: 1,
    connect_error: 1,
    disconnect: 1,
    disconnecting: 1,
    // EventEmitter reserved events: https://nodejs.org/api/events.html#events_event_newlistener
    newListener: 1,
    removeListener: 1,
});
class Socket extends Emitter {
    /**
     * `Socket` constructor.
     *
     * @public
     */
    constructor(io, nsp, opts) {
        super();
        this.ids = 0;
        this.acks = {};
        this.receiveBuffer = [];
        this.sendBuffer = [];
        this.flags = {};
        this.io = io;
        this.nsp = nsp;
        this.ids = 0;
        this.acks = {};
        this.receiveBuffer = [];
        this.sendBuffer = [];
        this.connected = false;
        this.disconnected = true;
        this.flags = {};
        if (opts && opts.auth) {
            this.auth = opts.auth;
        }
        if (this.io._autoConnect)
            this.open();
    }
    /**
     * Subscribe to open, close and packet events
     *
     * @private
     */
    subEvents() {
        if (this.subs)
            return;
        const io = this.io;
        this.subs = [
            on_1.on(io, "open", bind(this, "onopen")),
            on_1.on(io, "packet", bind(this, "onpacket")),
            on_1.on(io, "close", bind(this, "onclose")),
        ];
    }
    /**
     * Whether the Socket will try to reconnect when its Manager connects or reconnects
     */
    get active() {
        return !!this.subs;
    }
    /**
     * "Opens" the socket.
     *
     * @public
     */
    connect() {
        if (this.connected)
            return this;
        this.subEvents();
        if (!this.io["_reconnecting"])
            this.io.open(); // ensure open
        if ("open" === this.io._readyState)
            this.onopen();
        return this;
    }
    /**
     * Alias for connect()
     */
    open() {
        return this.connect();
    }
    /**
     * Sends a `message` event.
     *
     * @return self
     * @public
     */
    send(...args) {
        args.unshift("message");
        this.emit.apply(this, args);
        return this;
    }
    /**
     * Override `emit`.
     * If the event is in `events`, it's emitted normally.
     *
     * @param ev - event name
     * @return self
     * @public
     */
    emit(ev, ...args) {
        if (RESERVED_EVENTS.hasOwnProperty(ev)) {
            throw new Error('"' + ev + '" is a reserved event name');
        }
        args.unshift(ev);
        const packet = {
            type: socket_io_parser_1.PacketType.EVENT,
            data: args,
        };
        packet.options = {};
        packet.options.compress = this.flags.compress !== false;
        // event ack callback
        if ("function" === typeof args[args.length - 1]) {
            debug("emitting packet with ack id %d", this.ids);
            this.acks[this.ids] = args.pop();
            packet.id = this.ids++;
        }
        const isTransportWritable = this.io.engine &&
            this.io.engine.transport &&
            this.io.engine.transport.writable;
        const discardPacket = this.flags.volatile && (!isTransportWritable || !this.connected);
        if (discardPacket) {
            debug("discard packet as the transport is not currently writable");
        }
        else if (this.connected) {
            this.packet(packet);
        }
        else {
            this.sendBuffer.push(packet);
        }
        this.flags = {};
        return this;
    }
    /**
     * Sends a packet.
     *
     * @param packet
     * @private
     */
    packet(packet) {
        packet.nsp = this.nsp;
        this.io._packet(packet);
    }
    /**
     * Called upon engine `open`.
     *
     * @private
     */
    onopen() {
        debug("transport is open - connecting");
        if (typeof this.auth == "function") {
            this.auth((data) => {
                this.packet({ type: socket_io_parser_1.PacketType.CONNECT, data });
            });
        }
        else {
            this.packet({ type: socket_io_parser_1.PacketType.CONNECT, data: this.auth });
        }
    }
    /**
     * Called upon engine `close`.
     *
     * @param reason
     * @private
     */
    onclose(reason) {
        debug("close (%s)", reason);
        this.connected = false;
        this.disconnected = true;
        delete this.id;
        super.emit("disconnect", reason);
    }
    /**
     * Called with socket packet.
     *
     * @param packet
     * @private
     */
    onpacket(packet) {
        const sameNamespace = packet.nsp === this.nsp;
        if (!sameNamespace)
            return;
        switch (packet.type) {
            case socket_io_parser_1.PacketType.CONNECT:
                if (packet.data && packet.data.sid) {
                    const id = packet.data.sid;
                    this.onconnect(id);
                }
                else {
                    super.emit("connect_error", new Error("It seems you are trying to reach a Socket.IO server in v2.x with a v3.x client, but they are not compatible (more information here: https://socket.io/docs/v3/migrating-from-2-x-to-3-0/)"));
                }
                break;
            case socket_io_parser_1.PacketType.EVENT:
                this.onevent(packet);
                break;
            case socket_io_parser_1.PacketType.BINARY_EVENT:
                this.onevent(packet);
                break;
            case socket_io_parser_1.PacketType.ACK:
                this.onack(packet);
                break;
            case socket_io_parser_1.PacketType.BINARY_ACK:
                this.onack(packet);
                break;
            case socket_io_parser_1.PacketType.DISCONNECT:
                this.ondisconnect();
                break;
            case socket_io_parser_1.PacketType.CONNECT_ERROR:
                const err = new Error(packet.data.message);
                // @ts-ignore
                err.data = packet.data.data;
                super.emit("connect_error", err);
                break;
        }
    }
    /**
     * Called upon a server event.
     *
     * @param packet
     * @private
     */
    onevent(packet) {
        const args = packet.data || [];
        debug("emitting event %j", args);
        if (null != packet.id) {
            debug("attaching ack callback to event");
            args.push(this.ack(packet.id));
        }
        if (this.connected) {
            this.emitEvent(args);
        }
        else {
            this.receiveBuffer.push(Object.freeze(args));
        }
    }
    emitEvent(args) {
        if (this._anyListeners && this._anyListeners.length) {
            const listeners = this._anyListeners.slice();
            for (const listener of listeners) {
                listener.apply(this, args);
            }
        }
        super.emit.apply(this, args);
    }
    /**
     * Produces an ack callback to emit with an event.
     *
     * @private
     */
    ack(id) {
        const self = this;
        let sent = false;
        return function (...args) {
            // prevent double callbacks
            if (sent)
                return;
            sent = true;
            debug("sending ack %j", args);
            self.packet({
                type: socket_io_parser_1.PacketType.ACK,
                id: id,
                data: args,
            });
        };
    }
    /**
     * Called upon a server acknowlegement.
     *
     * @param packet
     * @private
     */
    onack(packet) {
        const ack = this.acks[packet.id];
        if ("function" === typeof ack) {
            debug("calling ack %s with %j", packet.id, packet.data);
            ack.apply(this, packet.data);
            delete this.acks[packet.id];
        }
        else {
            debug("bad ack %s", packet.id);
        }
    }
    /**
     * Called upon server connect.
     *
     * @private
     */
    onconnect(id) {
        debug("socket connected with id %s", id);
        this.id = id;
        this.connected = true;
        this.disconnected = false;
        super.emit("connect");
        this.emitBuffered();
    }
    /**
     * Emit buffered events (received and emitted).
     *
     * @private
     */
    emitBuffered() {
        this.receiveBuffer.forEach((args) => this.emitEvent(args));
        this.receiveBuffer = [];
        this.sendBuffer.forEach((packet) => this.packet(packet));
        this.sendBuffer = [];
    }
    /**
     * Called upon server disconnect.
     *
     * @private
     */
    ondisconnect() {
        debug("server disconnect (%s)", this.nsp);
        this.destroy();
        this.onclose("io server disconnect");
    }
    /**
     * Called upon forced client/server side disconnections,
     * this method ensures the manager stops tracking us and
     * that reconnections don't get triggered for this.
     *
     * @private
     */
    destroy() {
        if (this.subs) {
            // clean subscriptions to avoid reconnections
            for (let i = 0; i < this.subs.length; i++) {
                this.subs[i].destroy();
            }
            this.subs = null;
        }
        this.io["_destroy"](this);
    }
    /**
     * Disconnects the socket manually.
     *
     * @return self
     * @public
     */
    disconnect() {
        if (this.connected) {
            debug("performing disconnect (%s)", this.nsp);
            this.packet({ type: socket_io_parser_1.PacketType.DISCONNECT });
        }
        // remove socket from pool
        this.destroy();
        if (this.connected) {
            // fire events
            this.onclose("io client disconnect");
        }
        return this;
    }
    /**
     * Alias for disconnect()
     *
     * @return self
     * @public
     */
    close() {
        return this.disconnect();
    }
    /**
     * Sets the compress flag.
     *
     * @param compress - if `true`, compresses the sending data
     * @return self
     * @public
     */
    compress(compress) {
        this.flags.compress = compress;
        return this;
    }
    /**
     * Sets a modifier for a subsequent event emission that the event message will be dropped when this socket is not
     * ready to send messages.
     *
     * @returns self
     * @public
     */
    get volatile() {
        this.flags.volatile = true;
        return this;
    }
    /**
     * Adds a listener that will be fired when any event is emitted. The event name is passed as the first argument to the
     * callback.
     *
     * @param listener
     * @public
     */
    onAny(listener) {
        this._anyListeners = this._anyListeners || [];
        this._anyListeners.push(listener);
        return this;
    }
    /**
     * Adds a listener that will be fired when any event is emitted. The event name is passed as the first argument to the
     * callback. The listener is added to the beginning of the listeners array.
     *
     * @param listener
     * @public
     */
    prependAny(listener) {
        this._anyListeners = this._anyListeners || [];
        this._anyListeners.unshift(listener);
        return this;
    }
    /**
     * Removes the listener that will be fired when any event is emitted.
     *
     * @param listener
     * @public
     */
    offAny(listener) {
        if (!this._anyListeners) {
            return this;
        }
        if (listener) {
            const listeners = this._anyListeners;
            for (let i = 0; i < listeners.length; i++) {
                if (listener === listeners[i]) {
                    listeners.splice(i, 1);
                    return this;
                }
            }
        }
        else {
            this._anyListeners = [];
        }
        return this;
    }
    /**
     * Returns an array of listeners that are listening for any event that is specified. This array can be manipulated,
     * e.g. to remove listeners.
     *
     * @public
     */
    listenersAny() {
        return this._anyListeners || [];
    }
}
exports.Socket = Socket;


/***/ }),
/* 42 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.hasBinary = exports.isBinary = void 0;
const withNativeArrayBuffer = typeof ArrayBuffer === "function";
const isView = (obj) => {
    return typeof ArrayBuffer.isView === "function"
        ? ArrayBuffer.isView(obj)
        : obj.buffer instanceof ArrayBuffer;
};
const toString = Object.prototype.toString;
const withNativeBlob = typeof Blob === "function" ||
    (typeof Blob !== "undefined" &&
        toString.call(Blob) === "[object BlobConstructor]");
const withNativeFile = typeof File === "function" ||
    (typeof File !== "undefined" &&
        toString.call(File) === "[object FileConstructor]");
/**
 * Returns true if obj is a Buffer, an ArrayBuffer, a Blob or a File.
 *
 * @private
 */
function isBinary(obj) {
    return ((withNativeArrayBuffer && (obj instanceof ArrayBuffer || isView(obj))) ||
        (withNativeBlob && obj instanceof Blob) ||
        (withNativeFile && obj instanceof File));
}
exports.isBinary = isBinary;
function hasBinary(obj, toJSON) {
    if (!obj || typeof obj !== "object") {
        return false;
    }
    if (Array.isArray(obj)) {
        for (let i = 0, l = obj.length; i < l; i++) {
            if (hasBinary(obj[i])) {
                return true;
            }
        }
        return false;
    }
    if (isBinary(obj)) {
        return true;
    }
    if (obj.toJSON &&
        typeof obj.toJSON === "function" &&
        arguments.length === 1) {
        return hasBinary(obj.toJSON(), true);
    }
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key) && hasBinary(obj[key])) {
            return true;
        }
    }
    return false;
}
exports.hasBinary = hasBinary;


/***/ }),
/* 43 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.on = void 0;
function on(obj, ev, fn) {
    obj.on(ev, fn);
    return {
        destroy: function () {
            obj.off(ev, fn);
        },
    };
}
exports.on = on;


/***/ }),
/* 44 */
/***/ (function(module, exports, __webpack_require__) {

// style-loader: Adds some css to the DOM by adding a <style> tag

// load the styles
var content = __webpack_require__(57);
if(typeof content === 'string') content = [[module.i, content, '']];
if(content.locals) module.exports = content.locals;
// add CSS to SSR context
var add = __webpack_require__(6).default
module.exports.__inject__ = function (context) {
  add("1b7833da", content, true, context)
};

/***/ }),
/* 45 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.Socket = exports.io = exports.Manager = exports.protocol = void 0;
const url_1 = __webpack_require__(46);
const manager_1 = __webpack_require__(35);
const socket_1 = __webpack_require__(41);
Object.defineProperty(exports, "Socket", { enumerable: true, get: function () { return socket_1.Socket; } });
const debug = __webpack_require__(23)("socket.io-client");
/**
 * Module exports.
 */
module.exports = exports = lookup;
/**
 * Managers cache.
 */
const cache = (exports.managers = {});
function lookup(uri, opts) {
    if (typeof uri === "object") {
        opts = uri;
        uri = undefined;
    }
    opts = opts || {};
    const parsed = url_1.url(uri);
    const source = parsed.source;
    const id = parsed.id;
    const path = parsed.path;
    const sameNamespace = cache[id] && path in cache[id]["nsps"];
    const newConnection = opts.forceNew ||
        opts["force new connection"] ||
        false === opts.multiplex ||
        sameNamespace;
    let io;
    if (newConnection) {
        debug("ignoring socket cache for %s", source);
        io = new manager_1.Manager(source, opts);
    }
    else {
        if (!cache[id]) {
            debug("new io instance for %s", source);
            cache[id] = new manager_1.Manager(source, opts);
        }
        io = cache[id];
    }
    if (parsed.query && !opts.query) {
        opts.query = parsed.query;
    }
    return io.socket(parsed.path, opts);
}
exports.io = lookup;
/**
 * Protocol version.
 *
 * @public
 */
var socket_io_parser_1 = __webpack_require__(34);
Object.defineProperty(exports, "protocol", { enumerable: true, get: function () { return socket_io_parser_1.protocol; } });
/**
 * `connect`.
 *
 * @param {String} uri
 * @public
 */
exports.connect = lookup;
/**
 * Expose constructors for standalone build.
 *
 * @public
 */
var manager_2 = __webpack_require__(35);
Object.defineProperty(exports, "Manager", { enumerable: true, get: function () { return manager_2.Manager; } });


/***/ }),
/* 46 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.url = void 0;
const parseuri = __webpack_require__(26);
const debug = __webpack_require__(23)("socket.io-client:url");
/**
 * URL parser.
 *
 * @param uri - url
 * @param loc - An object meant to mimic window.location.
 *        Defaults to window.location.
 * @public
 */
function url(uri, loc) {
    let obj = uri;
    // default to window.location
    loc = loc || (typeof location !== "undefined" && location);
    if (null == uri)
        uri = loc.protocol + "//" + loc.host;
    // relative path support
    if (typeof uri === "string") {
        if ("/" === uri.charAt(0)) {
            if ("/" === uri.charAt(1)) {
                uri = loc.protocol + uri;
            }
            else {
                uri = loc.host + uri;
            }
        }
        if (!/^(https?|wss?):\/\//.test(uri)) {
            debug("protocol-less url %s", uri);
            if ("undefined" !== typeof loc) {
                uri = loc.protocol + "//" + uri;
            }
            else {
                uri = "https://" + uri;
            }
        }
        // parse
        debug("parse %s", uri);
        obj = parseuri(uri);
    }
    // make sure we treat `localhost:80` and `localhost` equally
    if (!obj.port) {
        if (/^(http|ws)$/.test(obj.protocol)) {
            obj.port = "80";
        }
        else if (/^(http|ws)s$/.test(obj.protocol)) {
            obj.port = "443";
        }
    }
    obj.path = obj.path || "/";
    const ipv6 = obj.host.indexOf(":") !== -1;
    const host = ipv6 ? "[" + obj.host + "]" : obj.host;
    // define unique id
    obj.id = obj.protocol + "://" + host + ":" + obj.port;
    // define href
    obj.href =
        obj.protocol +
            "://" +
            host +
            (loc && loc.port === obj.port ? "" : ":" + obj.port);
    return obj;
}
exports.url = url;


/***/ }),
/* 47 */
/***/ (function(module, exports, __webpack_require__) {

const Socket = __webpack_require__(48);

module.exports = (uri, opts) => new Socket(uri, opts);

/**
 * Expose deps for legacy compatibility
 * and standalone browser access.
 */

module.exports.Socket = Socket;
module.exports.protocol = Socket.protocol; // this is an int
module.exports.Transport = __webpack_require__(33);
module.exports.transports = __webpack_require__(36);
module.exports.parser = __webpack_require__(32);


/***/ }),
/* 48 */
/***/ (function(module, exports, __webpack_require__) {

const transports = __webpack_require__(36);
const Emitter = __webpack_require__(24);
const debug = __webpack_require__(23)("engine.io-client:socket");
const parser = __webpack_require__(32);
const parseuri = __webpack_require__(26);
const parseqs = __webpack_require__(25);

class Socket extends Emitter {
  /**
   * Socket constructor.
   *
   * @param {String|Object} uri or options
   * @param {Object} options
   * @api public
   */
  constructor(uri, opts = {}) {
    super();

    if (uri && "object" === typeof uri) {
      opts = uri;
      uri = null;
    }

    if (uri) {
      uri = parseuri(uri);
      opts.hostname = uri.host;
      opts.secure = uri.protocol === "https" || uri.protocol === "wss";
      opts.port = uri.port;
      if (uri.query) opts.query = uri.query;
    } else if (opts.host) {
      opts.hostname = parseuri(opts.host).host;
    }

    this.secure =
      null != opts.secure
        ? opts.secure
        : typeof location !== "undefined" && "https:" === location.protocol;

    if (opts.hostname && !opts.port) {
      // if no port is specified manually, use the protocol default
      opts.port = this.secure ? "443" : "80";
    }

    this.hostname =
      opts.hostname ||
      (typeof location !== "undefined" ? location.hostname : "localhost");
    this.port =
      opts.port ||
      (typeof location !== "undefined" && location.port
        ? location.port
        : this.secure
        ? 443
        : 80);

    this.transports = opts.transports || ["polling", "websocket"];
    this.readyState = "";
    this.writeBuffer = [];
    this.prevBufferLen = 0;

    this.opts = Object.assign(
      {
        path: "/engine.io",
        agent: false,
        withCredentials: false,
        upgrade: true,
        jsonp: true,
        timestampParam: "t",
        rememberUpgrade: false,
        rejectUnauthorized: true,
        perMessageDeflate: {
          threshold: 1024
        },
        transportOptions: {}
      },
      opts
    );

    this.opts.path = this.opts.path.replace(/\/$/, "") + "/";

    if (typeof this.opts.query === "string") {
      this.opts.query = parseqs.decode(this.opts.query);
    }

    // set on handshake
    this.id = null;
    this.upgrades = null;
    this.pingInterval = null;
    this.pingTimeout = null;

    // set on heartbeat
    this.pingTimeoutTimer = null;

    this.open();
  }

  /**
   * Creates transport of the given type.
   *
   * @param {String} transport name
   * @return {Transport}
   * @api private
   */
  createTransport(name) {
    debug('creating transport "%s"', name);
    const query = clone(this.opts.query);

    // append engine.io protocol identifier
    query.EIO = parser.protocol;

    // transport name
    query.transport = name;

    // session id if we already have one
    if (this.id) query.sid = this.id;

    const opts = Object.assign(
      {},
      this.opts.transportOptions[name],
      this.opts,
      {
        query,
        socket: this,
        hostname: this.hostname,
        secure: this.secure,
        port: this.port
      }
    );

    debug("options: %j", opts);

    return new transports[name](opts);
  }

  /**
   * Initializes transport to use and starts probe.
   *
   * @api private
   */
  open() {
    let transport;
    if (
      this.opts.rememberUpgrade &&
      Socket.priorWebsocketSuccess &&
      this.transports.indexOf("websocket") !== -1
    ) {
      transport = "websocket";
    } else if (0 === this.transports.length) {
      // Emit error on next tick so it can be listened to
      const self = this;
      setTimeout(function() {
        self.emit("error", "No transports available");
      }, 0);
      return;
    } else {
      transport = this.transports[0];
    }
    this.readyState = "opening";

    // Retry with the next transport if the transport is disabled (jsonp: false)
    try {
      transport = this.createTransport(transport);
    } catch (e) {
      debug("error while creating transport: %s", e);
      this.transports.shift();
      this.open();
      return;
    }

    transport.open();
    this.setTransport(transport);
  }

  /**
   * Sets the current transport. Disables the existing one (if any).
   *
   * @api private
   */
  setTransport(transport) {
    debug("setting transport %s", transport.name);
    const self = this;

    if (this.transport) {
      debug("clearing existing transport %s", this.transport.name);
      this.transport.removeAllListeners();
    }

    // set up transport
    this.transport = transport;

    // set up transport listeners
    transport
      .on("drain", function() {
        self.onDrain();
      })
      .on("packet", function(packet) {
        self.onPacket(packet);
      })
      .on("error", function(e) {
        self.onError(e);
      })
      .on("close", function() {
        self.onClose("transport close");
      });
  }

  /**
   * Probes a transport.
   *
   * @param {String} transport name
   * @api private
   */
  probe(name) {
    debug('probing transport "%s"', name);
    let transport = this.createTransport(name, { probe: 1 });
    let failed = false;
    const self = this;

    Socket.priorWebsocketSuccess = false;

    function onTransportOpen() {
      if (self.onlyBinaryUpgrades) {
        const upgradeLosesBinary =
          !this.supportsBinary && self.transport.supportsBinary;
        failed = failed || upgradeLosesBinary;
      }
      if (failed) return;

      debug('probe transport "%s" opened', name);
      transport.send([{ type: "ping", data: "probe" }]);
      transport.once("packet", function(msg) {
        if (failed) return;
        if ("pong" === msg.type && "probe" === msg.data) {
          debug('probe transport "%s" pong', name);
          self.upgrading = true;
          self.emit("upgrading", transport);
          if (!transport) return;
          Socket.priorWebsocketSuccess = "websocket" === transport.name;

          debug('pausing current transport "%s"', self.transport.name);
          self.transport.pause(function() {
            if (failed) return;
            if ("closed" === self.readyState) return;
            debug("changing transport and sending upgrade packet");

            cleanup();

            self.setTransport(transport);
            transport.send([{ type: "upgrade" }]);
            self.emit("upgrade", transport);
            transport = null;
            self.upgrading = false;
            self.flush();
          });
        } else {
          debug('probe transport "%s" failed', name);
          const err = new Error("probe error");
          err.transport = transport.name;
          self.emit("upgradeError", err);
        }
      });
    }

    function freezeTransport() {
      if (failed) return;

      // Any callback called by transport should be ignored since now
      failed = true;

      cleanup();

      transport.close();
      transport = null;
    }

    // Handle any error that happens while probing
    function onerror(err) {
      const error = new Error("probe error: " + err);
      error.transport = transport.name;

      freezeTransport();

      debug('probe transport "%s" failed because of error: %s', name, err);

      self.emit("upgradeError", error);
    }

    function onTransportClose() {
      onerror("transport closed");
    }

    // When the socket is closed while we're probing
    function onclose() {
      onerror("socket closed");
    }

    // When the socket is upgraded while we're probing
    function onupgrade(to) {
      if (transport && to.name !== transport.name) {
        debug('"%s" works - aborting "%s"', to.name, transport.name);
        freezeTransport();
      }
    }

    // Remove all listeners on the transport and on self
    function cleanup() {
      transport.removeListener("open", onTransportOpen);
      transport.removeListener("error", onerror);
      transport.removeListener("close", onTransportClose);
      self.removeListener("close", onclose);
      self.removeListener("upgrading", onupgrade);
    }

    transport.once("open", onTransportOpen);
    transport.once("error", onerror);
    transport.once("close", onTransportClose);

    this.once("close", onclose);
    this.once("upgrading", onupgrade);

    transport.open();
  }

  /**
   * Called when connection is deemed open.
   *
   * @api public
   */
  onOpen() {
    debug("socket open");
    this.readyState = "open";
    Socket.priorWebsocketSuccess = "websocket" === this.transport.name;
    this.emit("open");
    this.flush();

    // we check for `readyState` in case an `open`
    // listener already closed the socket
    if (
      "open" === this.readyState &&
      this.opts.upgrade &&
      this.transport.pause
    ) {
      debug("starting upgrade probes");
      let i = 0;
      const l = this.upgrades.length;
      for (; i < l; i++) {
        this.probe(this.upgrades[i]);
      }
    }
  }

  /**
   * Handles a packet.
   *
   * @api private
   */
  onPacket(packet) {
    if (
      "opening" === this.readyState ||
      "open" === this.readyState ||
      "closing" === this.readyState
    ) {
      debug('socket receive: type "%s", data "%s"', packet.type, packet.data);

      this.emit("packet", packet);

      // Socket is live - any packet counts
      this.emit("heartbeat");

      switch (packet.type) {
        case "open":
          this.onHandshake(JSON.parse(packet.data));
          break;

        case "ping":
          this.resetPingTimeout();
          this.sendPacket("pong");
          this.emit("pong");
          break;

        case "error":
          const err = new Error("server error");
          err.code = packet.data;
          this.onError(err);
          break;

        case "message":
          this.emit("data", packet.data);
          this.emit("message", packet.data);
          break;
      }
    } else {
      debug('packet received with socket readyState "%s"', this.readyState);
    }
  }

  /**
   * Called upon handshake completion.
   *
   * @param {Object} handshake obj
   * @api private
   */
  onHandshake(data) {
    this.emit("handshake", data);
    this.id = data.sid;
    this.transport.query.sid = data.sid;
    this.upgrades = this.filterUpgrades(data.upgrades);
    this.pingInterval = data.pingInterval;
    this.pingTimeout = data.pingTimeout;
    this.onOpen();
    // In case open handler closes socket
    if ("closed" === this.readyState) return;
    this.resetPingTimeout();
  }

  /**
   * Sets and resets ping timeout timer based on server pings.
   *
   * @api private
   */
  resetPingTimeout() {
    clearTimeout(this.pingTimeoutTimer);
    this.pingTimeoutTimer = setTimeout(() => {
      this.onClose("ping timeout");
    }, this.pingInterval + this.pingTimeout);
  }

  /**
   * Called on `drain` event
   *
   * @api private
   */
  onDrain() {
    this.writeBuffer.splice(0, this.prevBufferLen);

    // setting prevBufferLen = 0 is very important
    // for example, when upgrading, upgrade packet is sent over,
    // and a nonzero prevBufferLen could cause problems on `drain`
    this.prevBufferLen = 0;

    if (0 === this.writeBuffer.length) {
      this.emit("drain");
    } else {
      this.flush();
    }
  }

  /**
   * Flush write buffers.
   *
   * @api private
   */
  flush() {
    if (
      "closed" !== this.readyState &&
      this.transport.writable &&
      !this.upgrading &&
      this.writeBuffer.length
    ) {
      debug("flushing %d packets in socket", this.writeBuffer.length);
      this.transport.send(this.writeBuffer);
      // keep track of current length of writeBuffer
      // splice writeBuffer and callbackBuffer on `drain`
      this.prevBufferLen = this.writeBuffer.length;
      this.emit("flush");
    }
  }

  /**
   * Sends a message.
   *
   * @param {String} message.
   * @param {Function} callback function.
   * @param {Object} options.
   * @return {Socket} for chaining.
   * @api public
   */
  write(msg, options, fn) {
    this.sendPacket("message", msg, options, fn);
    return this;
  }

  send(msg, options, fn) {
    this.sendPacket("message", msg, options, fn);
    return this;
  }

  /**
   * Sends a packet.
   *
   * @param {String} packet type.
   * @param {String} data.
   * @param {Object} options.
   * @param {Function} callback function.
   * @api private
   */
  sendPacket(type, data, options, fn) {
    if ("function" === typeof data) {
      fn = data;
      data = undefined;
    }

    if ("function" === typeof options) {
      fn = options;
      options = null;
    }

    if ("closing" === this.readyState || "closed" === this.readyState) {
      return;
    }

    options = options || {};
    options.compress = false !== options.compress;

    const packet = {
      type: type,
      data: data,
      options: options
    };
    this.emit("packetCreate", packet);
    this.writeBuffer.push(packet);
    if (fn) this.once("flush", fn);
    this.flush();
  }

  /**
   * Closes the connection.
   *
   * @api private
   */
  close() {
    const self = this;

    if ("opening" === this.readyState || "open" === this.readyState) {
      this.readyState = "closing";

      if (this.writeBuffer.length) {
        this.once("drain", function() {
          if (this.upgrading) {
            waitForUpgrade();
          } else {
            close();
          }
        });
      } else if (this.upgrading) {
        waitForUpgrade();
      } else {
        close();
      }
    }

    function close() {
      self.onClose("forced close");
      debug("socket closing - telling transport to close");
      self.transport.close();
    }

    function cleanupAndClose() {
      self.removeListener("upgrade", cleanupAndClose);
      self.removeListener("upgradeError", cleanupAndClose);
      close();
    }

    function waitForUpgrade() {
      // wait for upgrade to finish since we can't send packets while pausing a transport
      self.once("upgrade", cleanupAndClose);
      self.once("upgradeError", cleanupAndClose);
    }

    return this;
  }

  /**
   * Called upon transport error
   *
   * @api private
   */
  onError(err) {
    debug("socket error %j", err);
    Socket.priorWebsocketSuccess = false;
    this.emit("error", err);
    this.onClose("transport error", err);
  }

  /**
   * Called upon transport close.
   *
   * @api private
   */
  onClose(reason, desc) {
    if (
      "opening" === this.readyState ||
      "open" === this.readyState ||
      "closing" === this.readyState
    ) {
      debug('socket close with reason: "%s"', reason);
      const self = this;

      // clear timers
      clearTimeout(this.pingIntervalTimer);
      clearTimeout(this.pingTimeoutTimer);

      // stop event from firing again for transport
      this.transport.removeAllListeners("close");

      // ensure transport won't stay open
      this.transport.close();

      // ignore further transport communication
      this.transport.removeAllListeners();

      // set ready state
      this.readyState = "closed";

      // clear session id
      this.id = null;

      // emit close event
      this.emit("close", reason, desc);

      // clean buffers after, so users can still
      // grab the buffers on `close` event
      self.writeBuffer = [];
      self.prevBufferLen = 0;
    }
  }

  /**
   * Filters upgrades, returning only those matching client transports.
   *
   * @param {Array} server upgrades
   * @api private
   *
   */
  filterUpgrades(upgrades) {
    const filteredUpgrades = [];
    let i = 0;
    const j = upgrades.length;
    for (; i < j; i++) {
      if (~this.transports.indexOf(upgrades[i]))
        filteredUpgrades.push(upgrades[i]);
    }
    return filteredUpgrades;
  }
}

Socket.priorWebsocketSuccess = false;

/**
 * Protocol version.
 *
 * @api public
 */

Socket.protocol = parser.protocol; // this is an int

function clone(obj) {
  const o = {};
  for (let i in obj) {
    if (obj.hasOwnProperty(i)) {
      o[i] = obj[i];
    }
  }
  return o;
}

module.exports = Socket;


/***/ }),
/* 49 */
/***/ (function(module, exports, __webpack_require__) {

/* global attachEvent */

const XMLHttpRequest = __webpack_require__(27);
const Polling = __webpack_require__(37);
const Emitter = __webpack_require__(24);
const { pick } = __webpack_require__(39);
const globalThis = __webpack_require__(40);

const debug = __webpack_require__(23)("engine.io-client:polling-xhr");

/**
 * Empty function
 */

function empty() {}

const hasXHR2 = (function() {
  const xhr = new XMLHttpRequest({ xdomain: false });
  return null != xhr.responseType;
})();

class XHR extends Polling {
  /**
   * XHR Polling constructor.
   *
   * @param {Object} opts
   * @api public
   */
  constructor(opts) {
    super(opts);

    if (typeof location !== "undefined") {
      const isSSL = "https:" === location.protocol;
      let port = location.port;

      // some user agents have empty `location.port`
      if (!port) {
        port = isSSL ? 443 : 80;
      }

      this.xd =
        (typeof location !== "undefined" &&
          opts.hostname !== location.hostname) ||
        port !== opts.port;
      this.xs = opts.secure !== isSSL;
    }
    /**
     * XHR supports binary
     */
    const forceBase64 = opts && opts.forceBase64;
    this.supportsBinary = hasXHR2 && !forceBase64;
  }

  /**
   * Creates a request.
   *
   * @param {String} method
   * @api private
   */
  request(opts = {}) {
    Object.assign(opts, { xd: this.xd, xs: this.xs }, this.opts);
    return new Request(this.uri(), opts);
  }

  /**
   * Sends data.
   *
   * @param {String} data to send.
   * @param {Function} called upon flush.
   * @api private
   */
  doWrite(data, fn) {
    const req = this.request({
      method: "POST",
      data: data
    });
    const self = this;
    req.on("success", fn);
    req.on("error", function(err) {
      self.onError("xhr post error", err);
    });
  }

  /**
   * Starts a poll cycle.
   *
   * @api private
   */
  doPoll() {
    debug("xhr poll");
    const req = this.request();
    const self = this;
    req.on("data", function(data) {
      self.onData(data);
    });
    req.on("error", function(err) {
      self.onError("xhr poll error", err);
    });
    this.pollXhr = req;
  }
}

class Request extends Emitter {
  /**
   * Request constructor
   *
   * @param {Object} options
   * @api public
   */
  constructor(uri, opts) {
    super();
    this.opts = opts;

    this.method = opts.method || "GET";
    this.uri = uri;
    this.async = false !== opts.async;
    this.data = undefined !== opts.data ? opts.data : null;

    this.create();
  }

  /**
   * Creates the XHR object and sends the request.
   *
   * @api private
   */
  create() {
    const opts = pick(
      this.opts,
      "agent",
      "enablesXDR",
      "pfx",
      "key",
      "passphrase",
      "cert",
      "ca",
      "ciphers",
      "rejectUnauthorized"
    );
    opts.xdomain = !!this.opts.xd;
    opts.xscheme = !!this.opts.xs;

    const xhr = (this.xhr = new XMLHttpRequest(opts));
    const self = this;

    try {
      debug("xhr open %s: %s", this.method, this.uri);
      xhr.open(this.method, this.uri, this.async);
      try {
        if (this.opts.extraHeaders) {
          xhr.setDisableHeaderCheck && xhr.setDisableHeaderCheck(true);
          for (let i in this.opts.extraHeaders) {
            if (this.opts.extraHeaders.hasOwnProperty(i)) {
              xhr.setRequestHeader(i, this.opts.extraHeaders[i]);
            }
          }
        }
      } catch (e) {}

      if ("POST" === this.method) {
        try {
          xhr.setRequestHeader("Content-type", "text/plain;charset=UTF-8");
        } catch (e) {}
      }

      try {
        xhr.setRequestHeader("Accept", "*/*");
      } catch (e) {}

      // ie6 check
      if ("withCredentials" in xhr) {
        xhr.withCredentials = this.opts.withCredentials;
      }

      if (this.opts.requestTimeout) {
        xhr.timeout = this.opts.requestTimeout;
      }

      if (this.hasXDR()) {
        xhr.onload = function() {
          self.onLoad();
        };
        xhr.onerror = function() {
          self.onError(xhr.responseText);
        };
      } else {
        xhr.onreadystatechange = function() {
          if (4 !== xhr.readyState) return;
          if (200 === xhr.status || 1223 === xhr.status) {
            self.onLoad();
          } else {
            // make sure the `error` event handler that's user-set
            // does not throw in the same tick and gets caught here
            setTimeout(function() {
              self.onError(typeof xhr.status === "number" ? xhr.status : 0);
            }, 0);
          }
        };
      }

      debug("xhr data %s", this.data);
      xhr.send(this.data);
    } catch (e) {
      // Need to defer since .create() is called directly from the constructor
      // and thus the 'error' event can only be only bound *after* this exception
      // occurs.  Therefore, also, we cannot throw here at all.
      setTimeout(function() {
        self.onError(e);
      }, 0);
      return;
    }

    if (typeof document !== "undefined") {
      this.index = Request.requestsCount++;
      Request.requests[this.index] = this;
    }
  }

  /**
   * Called upon successful response.
   *
   * @api private
   */
  onSuccess() {
    this.emit("success");
    this.cleanup();
  }

  /**
   * Called if we have data.
   *
   * @api private
   */
  onData(data) {
    this.emit("data", data);
    this.onSuccess();
  }

  /**
   * Called upon error.
   *
   * @api private
   */
  onError(err) {
    this.emit("error", err);
    this.cleanup(true);
  }

  /**
   * Cleans up house.
   *
   * @api private
   */
  cleanup(fromError) {
    if ("undefined" === typeof this.xhr || null === this.xhr) {
      return;
    }
    // xmlhttprequest
    if (this.hasXDR()) {
      this.xhr.onload = this.xhr.onerror = empty;
    } else {
      this.xhr.onreadystatechange = empty;
    }

    if (fromError) {
      try {
        this.xhr.abort();
      } catch (e) {}
    }

    if (typeof document !== "undefined") {
      delete Request.requests[this.index];
    }

    this.xhr = null;
  }

  /**
   * Called upon load.
   *
   * @api private
   */
  onLoad() {
    const data = this.xhr.responseText;
    if (data !== null) {
      this.onData(data);
    }
  }

  /**
   * Check if it has XDomainRequest.
   *
   * @api private
   */
  hasXDR() {
    return typeof XDomainRequest !== "undefined" && !this.xs && this.enablesXDR;
  }

  /**
   * Aborts the request.
   *
   * @api public
   */
  abort() {
    this.cleanup();
  }
}

/**
 * Aborts pending requests when unloading the window. This is needed to prevent
 * memory leaks (e.g. when using IE) and to ensure that no spurious error is
 * emitted.
 */

Request.requestsCount = 0;
Request.requests = {};

if (typeof document !== "undefined") {
  if (typeof attachEvent === "function") {
    attachEvent("onunload", unloadHandler);
  } else if (typeof addEventListener === "function") {
    const terminationEvent = "onpagehide" in globalThis ? "pagehide" : "unload";
    addEventListener(terminationEvent, unloadHandler, false);
  }
}

function unloadHandler() {
  for (let i in Request.requests) {
    if (Request.requests.hasOwnProperty(i)) {
      Request.requests[i].abort();
    }
  }
}

module.exports = XHR;
module.exports.Request = Request;


/***/ }),
/* 50 */
/***/ (function(module, exports, __webpack_require__) {

const { PACKET_TYPES } = __webpack_require__(38);

const encodePacket = ({ type, data }, supportsBinary, callback) => {
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    const buffer = toBuffer(data);
    return callback(encodeBuffer(buffer, supportsBinary));
  }
  // plain string
  return callback(PACKET_TYPES[type] + (data || ""));
};

const toBuffer = data => {
  if (Buffer.isBuffer(data)) {
    return data;
  } else if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  } else {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
};

// only 'message' packets can contain binary, so the type prefix is not needed
const encodeBuffer = (data, supportsBinary) => {
  return supportsBinary ? data : "b" + data.toString("base64");
};

module.exports = encodePacket;


/***/ }),
/* 51 */
/***/ (function(module, exports, __webpack_require__) {

const { PACKET_TYPES_REVERSE, ERROR_PACKET } = __webpack_require__(38);

const decodePacket = (encodedPacket, binaryType) => {
  if (typeof encodedPacket !== "string") {
    return {
      type: "message",
      data: mapBinary(encodedPacket, binaryType)
    };
  }
  const type = encodedPacket.charAt(0);
  if (type === "b") {
    const buffer = Buffer.from(encodedPacket.substring(1), "base64");
    return {
      type: "message",
      data: mapBinary(buffer, binaryType)
    };
  }
  if (!PACKET_TYPES_REVERSE[type]) {
    return ERROR_PACKET;
  }
  return encodedPacket.length > 1
    ? {
        type: PACKET_TYPES_REVERSE[type],
        data: encodedPacket.substring(1)
      }
    : {
        type: PACKET_TYPES_REVERSE[type]
      };
};

const mapBinary = (data, binaryType) => {
  const isBuffer = Buffer.isBuffer(data);
  switch (binaryType) {
    case "arraybuffer":
      return isBuffer ? toArrayBuffer(data) : data;
    case "nodebuffer":
    default:
      return data; // assuming the data is already a Buffer
  }
};

const toArrayBuffer = buffer => {
  const arrayBuffer = new ArrayBuffer(buffer.length);
  const view = new Uint8Array(arrayBuffer);
  for (let i = 0; i < buffer.length; i++) {
    view[i] = buffer[i];
  }
  return arrayBuffer;
};

module.exports = decodePacket;


/***/ }),
/* 52 */
/***/ (function(module, exports, __webpack_require__) {

const Polling = __webpack_require__(37);
const globalThis = __webpack_require__(40);

const rNewline = /\n/g;
const rEscapedNewline = /\\n/g;

/**
 * Global JSONP callbacks.
 */

let callbacks;

/**
 * Noop.
 */

function empty() {}

class JSONPPolling extends Polling {
  /**
   * JSONP Polling constructor.
   *
   * @param {Object} opts.
   * @api public
   */
  constructor(opts) {
    super(opts);

    this.query = this.query || {};

    // define global callbacks array if not present
    // we do this here (lazily) to avoid unneeded global pollution
    if (!callbacks) {
      // we need to consider multiple engines in the same page
      callbacks = globalThis.___eio = globalThis.___eio || [];
    }

    // callback identifier
    this.index = callbacks.length;

    // add callback to jsonp global
    const self = this;
    callbacks.push(function(msg) {
      self.onData(msg);
    });

    // append to query string
    this.query.j = this.index;

    // prevent spurious errors from being emitted when the window is unloaded
    if (typeof addEventListener === "function") {
      addEventListener(
        "beforeunload",
        function() {
          if (self.script) self.script.onerror = empty;
        },
        false
      );
    }
  }

  /**
   * JSONP only supports binary as base64 encoded strings
   */
  get supportsBinary() {
    return false;
  }

  /**
   * Closes the socket.
   *
   * @api private
   */
  doClose() {
    if (this.script) {
      this.script.parentNode.removeChild(this.script);
      this.script = null;
    }

    if (this.form) {
      this.form.parentNode.removeChild(this.form);
      this.form = null;
      this.iframe = null;
    }

    super.doClose();
  }

  /**
   * Starts a poll cycle.
   *
   * @api private
   */
  doPoll() {
    const self = this;
    const script = document.createElement("script");

    if (this.script) {
      this.script.parentNode.removeChild(this.script);
      this.script = null;
    }

    script.async = true;
    script.src = this.uri();
    script.onerror = function(e) {
      self.onError("jsonp poll error", e);
    };

    const insertAt = document.getElementsByTagName("script")[0];
    if (insertAt) {
      insertAt.parentNode.insertBefore(script, insertAt);
    } else {
      (document.head || document.body).appendChild(script);
    }
    this.script = script;

    const isUAgecko =
      "undefined" !== typeof navigator && /gecko/i.test(navigator.userAgent);

    if (isUAgecko) {
      setTimeout(function() {
        const iframe = document.createElement("iframe");
        document.body.appendChild(iframe);
        document.body.removeChild(iframe);
      }, 100);
    }
  }

  /**
   * Writes with a hidden iframe.
   *
   * @param {String} data to send
   * @param {Function} called upon flush.
   * @api private
   */
  doWrite(data, fn) {
    const self = this;
    let iframe;

    if (!this.form) {
      const form = document.createElement("form");
      const area = document.createElement("textarea");
      const id = (this.iframeId = "eio_iframe_" + this.index);

      form.className = "socketio";
      form.style.position = "absolute";
      form.style.top = "-1000px";
      form.style.left = "-1000px";
      form.target = id;
      form.method = "POST";
      form.setAttribute("accept-charset", "utf-8");
      area.name = "d";
      form.appendChild(area);
      document.body.appendChild(form);

      this.form = form;
      this.area = area;
    }

    this.form.action = this.uri();

    function complete() {
      initIframe();
      fn();
    }

    function initIframe() {
      if (self.iframe) {
        try {
          self.form.removeChild(self.iframe);
        } catch (e) {
          self.onError("jsonp polling iframe removal error", e);
        }
      }

      try {
        // ie6 dynamic iframes with target="" support (thanks Chris Lambacher)
        const html = '<iframe src="javascript:0" name="' + self.iframeId + '">';
        iframe = document.createElement(html);
      } catch (e) {
        iframe = document.createElement("iframe");
        iframe.name = self.iframeId;
        iframe.src = "javascript:0";
      }

      iframe.id = self.iframeId;

      self.form.appendChild(iframe);
      self.iframe = iframe;
    }

    initIframe();

    // escape \n to prevent it from being converted into \r\n by some UAs
    // double escaping is required for escaped new lines because unescaping of new lines can be done safely on server-side
    data = data.replace(rEscapedNewline, "\\\n");
    this.area.value = data.replace(rNewline, "\\n");

    try {
      this.form.submit();
    } catch (e) {}

    if (this.iframe.attachEvent) {
      this.iframe.onreadystatechange = function() {
        if (self.iframe.readyState === "complete") {
          complete();
        }
      };
    } else {
      this.iframe.onload = complete;
    }
  }
}

module.exports = JSONPPolling;


/***/ }),
/* 53 */
/***/ (function(module, exports, __webpack_require__) {

const Transport = __webpack_require__(33);
const parser = __webpack_require__(32);
const parseqs = __webpack_require__(25);
const yeast = __webpack_require__(28);
const { pick } = __webpack_require__(39);
const {
  WebSocket,
  usingBrowserWebSocket,
  defaultBinaryType
} = __webpack_require__(54);

const debug = __webpack_require__(23)("engine.io-client:websocket");

// detect ReactNative environment
const isReactNative =
  typeof navigator !== "undefined" &&
  typeof navigator.product === "string" &&
  navigator.product.toLowerCase() === "reactnative";

class WS extends Transport {
  /**
   * WebSocket transport constructor.
   *
   * @api {Object} connection options
   * @api public
   */
  constructor(opts) {
    super(opts);

    this.supportsBinary = !opts.forceBase64;
  }

  /**
   * Transport name.
   *
   * @api public
   */
  get name() {
    return "websocket";
  }

  /**
   * Opens socket.
   *
   * @api private
   */
  doOpen() {
    if (!this.check()) {
      // let probe timeout
      return;
    }

    const uri = this.uri();
    const protocols = this.opts.protocols;

    // React Native only supports the 'headers' option, and will print a warning if anything else is passed
    const opts = isReactNative
      ? {}
      : pick(
          this.opts,
          "agent",
          "perMessageDeflate",
          "pfx",
          "key",
          "passphrase",
          "cert",
          "ca",
          "ciphers",
          "rejectUnauthorized",
          "localAddress"
        );

    if (this.opts.extraHeaders) {
      opts.headers = this.opts.extraHeaders;
    }

    try {
      this.ws =
        usingBrowserWebSocket && !isReactNative
          ? protocols
            ? new WebSocket(uri, protocols)
            : new WebSocket(uri)
          : new WebSocket(uri, protocols, opts);
    } catch (err) {
      return this.emit("error", err);
    }

    this.ws.binaryType = this.socket.binaryType || defaultBinaryType;

    this.addEventListeners();
  }

  /**
   * Adds event listeners to the socket
   *
   * @api private
   */
  addEventListeners() {
    const self = this;

    this.ws.onopen = function() {
      self.onOpen();
    };
    this.ws.onclose = function() {
      self.onClose();
    };
    this.ws.onmessage = function(ev) {
      self.onData(ev.data);
    };
    this.ws.onerror = function(e) {
      self.onError("websocket error", e);
    };
  }

  /**
   * Writes data to socket.
   *
   * @param {Array} array of packets.
   * @api private
   */
  write(packets) {
    const self = this;
    this.writable = false;

    // encodePacket efficient as it uses WS framing
    // no need for encodePayload
    let total = packets.length;
    let i = 0;
    const l = total;
    for (; i < l; i++) {
      (function(packet) {
        parser.encodePacket(packet, self.supportsBinary, function(data) {
          // always create a new object (GH-437)
          const opts = {};
          if (!usingBrowserWebSocket) {
            if (packet.options) {
              opts.compress = packet.options.compress;
            }

            if (self.opts.perMessageDeflate) {
              const len =
                "string" === typeof data
                  ? Buffer.byteLength(data)
                  : data.length;
              if (len < self.opts.perMessageDeflate.threshold) {
                opts.compress = false;
              }
            }
          }

          // Sometimes the websocket has already been closed but the browser didn't
          // have a chance of informing us about it yet, in that case send will
          // throw an error
          try {
            if (usingBrowserWebSocket) {
              // TypeError is thrown when passing the second argument on Safari
              self.ws.send(data);
            } else {
              self.ws.send(data, opts);
            }
          } catch (e) {
            debug("websocket closed before onclose event");
          }

          --total || done();
        });
      })(packets[i]);
    }

    function done() {
      self.emit("flush");

      // fake drain
      // defer to next tick to allow Socket to clear writeBuffer
      setTimeout(function() {
        self.writable = true;
        self.emit("drain");
      }, 0);
    }
  }

  /**
   * Called upon close
   *
   * @api private
   */
  onClose() {
    Transport.prototype.onClose.call(this);
  }

  /**
   * Closes socket.
   *
   * @api private
   */
  doClose() {
    if (typeof this.ws !== "undefined") {
      this.ws.close();
    }
  }

  /**
   * Generates uri for connection.
   *
   * @api private
   */
  uri() {
    let query = this.query || {};
    const schema = this.opts.secure ? "wss" : "ws";
    let port = "";

    // avoid port if default for schema
    if (
      this.opts.port &&
      (("wss" === schema && Number(this.opts.port) !== 443) ||
        ("ws" === schema && Number(this.opts.port) !== 80))
    ) {
      port = ":" + this.opts.port;
    }

    // append timestamp to URI
    if (this.opts.timestampRequests) {
      query[this.opts.timestampParam] = yeast();
    }

    // communicate binary support capabilities
    if (!this.supportsBinary) {
      query.b64 = 1;
    }

    query = parseqs.encode(query);

    // prepend ? to query
    if (query.length) {
      query = "?" + query;
    }

    const ipv6 = this.opts.hostname.indexOf(":") !== -1;
    return (
      schema +
      "://" +
      (ipv6 ? "[" + this.opts.hostname + "]" : this.opts.hostname) +
      port +
      this.opts.path +
      query
    );
  }

  /**
   * Feature detection for WebSocket.
   *
   * @return {Boolean} whether this transport is available.
   * @api public
   */
  check() {
    return (
      !!WebSocket &&
      !("__initialize" in WebSocket && this.name === WS.prototype.name)
    );
  }
}

module.exports = WS;


/***/ }),
/* 54 */
/***/ (function(module, exports, __webpack_require__) {

module.exports = {
  WebSocket: __webpack_require__(30),
  usingBrowserWebSocket: false,
  defaultBinaryType: "nodebuffer"
};


/***/ }),
/* 55 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.reconstructPacket = exports.deconstructPacket = void 0;
const is_binary_1 = __webpack_require__(42);
/**
 * Replaces every Buffer | ArrayBuffer | Blob | File in packet with a numbered placeholder.
 *
 * @param {Object} packet - socket.io event packet
 * @return {Object} with deconstructed packet and list of buffers
 * @public
 */
function deconstructPacket(packet) {
    const buffers = [];
    const packetData = packet.data;
    const pack = packet;
    pack.data = _deconstructPacket(packetData, buffers);
    pack.attachments = buffers.length; // number of binary 'attachments'
    return { packet: pack, buffers: buffers };
}
exports.deconstructPacket = deconstructPacket;
function _deconstructPacket(data, buffers) {
    if (!data)
        return data;
    if (is_binary_1.isBinary(data)) {
        const placeholder = { _placeholder: true, num: buffers.length };
        buffers.push(data);
        return placeholder;
    }
    else if (Array.isArray(data)) {
        const newData = new Array(data.length);
        for (let i = 0; i < data.length; i++) {
            newData[i] = _deconstructPacket(data[i], buffers);
        }
        return newData;
    }
    else if (typeof data === "object" && !(data instanceof Date)) {
        const newData = {};
        for (const key in data) {
            if (data.hasOwnProperty(key)) {
                newData[key] = _deconstructPacket(data[key], buffers);
            }
        }
        return newData;
    }
    return data;
}
/**
 * Reconstructs a binary packet from its placeholder packet and buffers
 *
 * @param {Object} packet - event packet with placeholders
 * @param {Array} buffers - binary buffers to put in placeholder positions
 * @return {Object} reconstructed packet
 * @public
 */
function reconstructPacket(packet, buffers) {
    packet.data = _reconstructPacket(packet.data, buffers);
    packet.attachments = undefined; // no longer useful
    return packet;
}
exports.reconstructPacket = reconstructPacket;
function _reconstructPacket(data, buffers) {
    if (!data)
        return data;
    if (data && data._placeholder) {
        return buffers[data.num]; // appropriate buffer (should be natural order anyway)
    }
    else if (Array.isArray(data)) {
        for (let i = 0; i < data.length; i++) {
            data[i] = _reconstructPacket(data[i], buffers);
        }
    }
    else if (typeof data === "object") {
        for (const key in data) {
            if (data.hasOwnProperty(key)) {
                data[key] = _reconstructPacket(data[key], buffers);
            }
        }
    }
    return data;
}


/***/ }),
/* 56 */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _node_modules_vue_style_loader_index_js_ref_3_oneOf_1_0_node_modules_css_loader_dist_cjs_js_ref_3_oneOf_1_1_node_modules_vue_loader_lib_loaders_stylePostLoader_js_node_modules_postcss_loader_src_index_js_ref_3_oneOf_1_2_node_modules_nuxt_components_dist_loader_js_ref_0_0_node_modules_vue_loader_lib_index_js_vue_loader_options_index_vue_vue_type_style_index_0_lang_css___WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(44);
/* harmony import */ var _node_modules_vue_style_loader_index_js_ref_3_oneOf_1_0_node_modules_css_loader_dist_cjs_js_ref_3_oneOf_1_1_node_modules_vue_loader_lib_loaders_stylePostLoader_js_node_modules_postcss_loader_src_index_js_ref_3_oneOf_1_2_node_modules_nuxt_components_dist_loader_js_ref_0_0_node_modules_vue_loader_lib_index_js_vue_loader_options_index_vue_vue_type_style_index_0_lang_css___WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_node_modules_vue_style_loader_index_js_ref_3_oneOf_1_0_node_modules_css_loader_dist_cjs_js_ref_3_oneOf_1_1_node_modules_vue_loader_lib_loaders_stylePostLoader_js_node_modules_postcss_loader_src_index_js_ref_3_oneOf_1_2_node_modules_nuxt_components_dist_loader_js_ref_0_0_node_modules_vue_loader_lib_index_js_vue_loader_options_index_vue_vue_type_style_index_0_lang_css___WEBPACK_IMPORTED_MODULE_0__);
/* harmony reexport (unknown) */ for(var __WEBPACK_IMPORT_KEY__ in _node_modules_vue_style_loader_index_js_ref_3_oneOf_1_0_node_modules_css_loader_dist_cjs_js_ref_3_oneOf_1_1_node_modules_vue_loader_lib_loaders_stylePostLoader_js_node_modules_postcss_loader_src_index_js_ref_3_oneOf_1_2_node_modules_nuxt_components_dist_loader_js_ref_0_0_node_modules_vue_loader_lib_index_js_vue_loader_options_index_vue_vue_type_style_index_0_lang_css___WEBPACK_IMPORTED_MODULE_0__) if(["default"].indexOf(__WEBPACK_IMPORT_KEY__) < 0) (function(key) { __webpack_require__.d(__webpack_exports__, key, function() { return _node_modules_vue_style_loader_index_js_ref_3_oneOf_1_0_node_modules_css_loader_dist_cjs_js_ref_3_oneOf_1_1_node_modules_vue_loader_lib_loaders_stylePostLoader_js_node_modules_postcss_loader_src_index_js_ref_3_oneOf_1_2_node_modules_nuxt_components_dist_loader_js_ref_0_0_node_modules_vue_loader_lib_index_js_vue_loader_options_index_vue_vue_type_style_index_0_lang_css___WEBPACK_IMPORTED_MODULE_0__[key]; }) }(__WEBPACK_IMPORT_KEY__));


/***/ }),
/* 57 */
/***/ (function(module, exports, __webpack_require__) {

// Imports
var ___CSS_LOADER_API_IMPORT___ = __webpack_require__(5);
exports = ___CSS_LOADER_API_IMPORT___(false);
exports.push([module.i, "@import url(https://fonts.googleapis.com/css2?family=Roboto&display=swap);"]);
// Module
exports.push([module.i, "*{padding:5px;font-family:\"Roboto\",sans-serif}.input{display:flex;flex-direction:column}p{border-bottom:1px solid #000}", ""]);
// Exports
module.exports = exports;


/***/ }),
/* 58 */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// CONCATENATED MODULE: ./node_modules/vue-loader/lib/loaders/templateLoader.js??vue-loader-options!./node_modules/@nuxt/components/dist/loader.js??ref--0-0!./node_modules/vue-loader/lib??vue-loader-options!./pages/index.vue?vue&type=template&id=7b146ec0&
var render = function () {var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('div',{attrs:{"id":"container"}},[_vm._ssrNode("<h1>EASY CHAT</h1> "+(_vm._ssrList((_vm.chat),function(c){return ("<div id=\"chat_container\"><p>"+_vm._ssrEscape(_vm._s(c.content)+" : ("+_vm._s(c.name)+") ("+_vm._s(c.time)+")")+"</p></div>")}))+" <div id=\"input_container\"><div class=\"input\"><label>NAME:</label> <input type=\"text\""+(_vm._ssrAttr("value",(_vm.name)))+"></div> <div class=\"input\"><label>TEXT:</label> <textarea cols=\"30\" rows=\"10\">"+_vm._ssrEscape(_vm._s(_vm.content))+"</textarea></div> <button"+(_vm._ssrAttr("disabled",_vm.canSubmit))+">submit</button></div>")])}
var staticRenderFns = []


// CONCATENATED MODULE: ./pages/index.vue?vue&type=template&id=7b146ec0&

// EXTERNAL MODULE: external "vue"
var external_vue_ = __webpack_require__(0);
var external_vue_default = /*#__PURE__*/__webpack_require__.n(external_vue_);

// EXTERNAL MODULE: ./node_modules/socket.io-client/build/index.js
var build = __webpack_require__(45);

// CONCATENATED MODULE: ./node_modules/babel-loader/lib??ref--12-0!./node_modules/ts-loader??ref--12-1!./node_modules/@nuxt/components/dist/loader.js??ref--0-0!./node_modules/vue-loader/lib??vue-loader-options!./pages/index.vue?vue&type=script&lang=ts&



class ChatData {
  constructor(name, content) {
    this.name = name;
    this.content = content;
    const d = new Date();
    this.time = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`;
    this.id = d.getTime();
  }

}

/* harmony default export */ var lib_vue_loader_options_pagesvue_type_script_lang_ts_ = (external_vue_default.a.extend({
  data: () => ({
    name: '',
    content: '',
    chat: [new ChatData('', '')],
    socket: Object(build["io"])(`ws.chattestserveringcp.ml`)
  }),
  computed: {
    canSubmit: function () {
      return this.name === '' || this.content === '';
    }
  },
  mounted: function () {
    this.socket.on('init', d => {
      this.chat = d;
    });
    this.socket.on('update', d => {
      this.chat.push(d);
    });
  },
  methods: {
    submit: function () {
      const d = new ChatData(this.name, this.content);
      this.socket.emit('submit', d);
      this.chat.push(d);
    }
  }
}));
// CONCATENATED MODULE: ./pages/index.vue?vue&type=script&lang=ts&
 /* harmony default export */ var pagesvue_type_script_lang_ts_ = (lib_vue_loader_options_pagesvue_type_script_lang_ts_); 
// EXTERNAL MODULE: ./node_modules/vue-loader/lib/runtime/componentNormalizer.js
var componentNormalizer = __webpack_require__(1);

// CONCATENATED MODULE: ./pages/index.vue



function injectStyles (context) {
  
  var style0 = __webpack_require__(56)
if (style0.__inject__) style0.__inject__(context)

}

/* normalize component */

var component = Object(componentNormalizer["a" /* default */])(
  pagesvue_type_script_lang_ts_,
  render,
  staticRenderFns,
  false,
  injectStyles,
  null,
  "a1d7ee36"
  
)

/* harmony default export */ var pages = __webpack_exports__["default"] = (component.exports);

/***/ })
]);;
//# sourceMappingURL=index.js.map