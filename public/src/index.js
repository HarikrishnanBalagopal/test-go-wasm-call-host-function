import { WASI, Fd, File, OpenFile, PreopenDirectory } from "@bjorn3/browser_wasi_shim";

class XtermStdio extends Fd {
    constructor() {
        super();
    }
    fd_write(view8/*: Uint8Array*/, iovs/*: [wasi.Iovec]*/)/*: {ret: number, nwritten: number}*/ {
        let nwritten = 0;
        const decoder = new TextDecoder('utf-8');
        for (let iovec of iovs) {
            const buffer = view8.slice(iovec.buf, iovec.buf + iovec.buf_len);
            const s = decoder.decode(buffer);
            // console.log(iovec.buf_len, iovec.buf_len, buffer, s);
            console.log(s);
            // let buffer = view8.slice(iovec.buf, iovec.buf + iovec.buf_len);
            // this.term.writeUtf8(buffer);
            nwritten += iovec.buf_len;
        }
        return { ret: 0, nwritten };
    }
}

// const ciovec_read_bytes = (view, ptr) => {
//     const iovec = { buf: -1, buf_len: -1 };
//     iovec.buf = view.getUint32(ptr, true);
//     iovec.buf_len = view.getUint32(ptr + 4, true);
//     return iovec;
// };

// const ciovec_read_bytes_array = (view, ptr, len) => {
//     const iovecs = [];
//     for (let i = 0; i < len; i++) {
//         iovecs.push(ciovec_read_bytes(view, ptr + 8 * i));
//     }
//     return iovecs;
// };

const main = async () => {
    console.log('main start');
    const res = await fetch('main.wasm');
    if (!res.ok) throw new Error('failed to fetch main.wasm');
    const wasmBytes = await res.arrayBuffer();
    const wasmModule = await WebAssembly.compile(wasmBytes);
    console.log('wasmModule', wasmModule);
    const fibRes = await fetch('fib.wasm');
    if (!fibRes.ok) throw new Error('failed to fetch fib.wasm');
    const fibWasmBytes = await fibRes.arrayBuffer();

    // const importObject = {};
    // const wasmModuleInstance = await WebAssembly.instantiate(wasmModule, importObject);
    // console.log('wasmModuleInstance', wasmModuleInstance);

    const args = ["main.wasm", "arg1", "arg2"];
    const env = ["FOO=bar"];
    const fds = [
        new OpenFile(new File([])), // stdin
        // new OpenFile(new File([])), // stdout
        new XtermStdio(),
        new OpenFile(new File([])), // stderr
        new PreopenDirectory(".", {
            "example.c": new File(new TextEncoder("utf-8").encode(`#include "a"`)),
            "hello.rs": new File(new TextEncoder("utf-8").encode(`fn main() { println!("Hello World!"); }`)),
            "fib.wasm": new File(new Uint8Array(fibWasmBytes)),
        }),
    ];
    const wasi = new WASI(args, env, fds);

    let WASM_INSTANCE = null;
    const load_string = (ptr, len) => {
        if (!WASM_INSTANCE) throw new Error('the wasm instance is missing');
        const memory = new Uint8Array(WASM_INSTANCE.exports.memory.buffer);
        const buf = memory.slice(ptr, ptr + len);
        const decoder = new TextDecoder('utf-8');
        const s = decoder.decode(buf);
        return s;
    };
    let NEW_MODULE_ID = 41;
    const MODULE_MAP = {};
    const load_wasm_module = (wasmModulePathPtr, wasmModulePathLength) => {
        const s = load_string(wasmModulePathPtr, wasmModulePathLength);
        console.log('load_wasm_module called with:', s);
        // https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/Module/Module
        const myModule = new WebAssembly.Module(fibWasmBytes);
        const importObject = {
            'console': {
                'log': console.log
            }
        };
        // https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/Instance/Instance
        const instance = new WebAssembly.Instance(myModule, importObject);
        console.log('compiled wasm and made an instance:', instance);
        const new_key = ++NEW_MODULE_ID;
        MODULE_MAP[new_key] = instance;
        return new_key;
    };
    const run_transform = (wasmModuleId, inputJsonPtr, inputJsonLength) => {
        if(!(wasmModuleId in MODULE_MAP)) throw new Error('wasm module not loaded');
        const wasmModule = MODULE_MAP[wasmModuleId];
        const s = load_string(inputJsonPtr, inputJsonLength);
        const input = JSON.parse(s);
        console.log('run_transform called with: wasmModuleId:', wasmModuleId, 'wasmModule', wasmModule, 's:', s, 'input:', input);
        return 0;
    };
    const importObject = {
        "wasi_snapshot_preview1": wasi.wasiImport,
        'mym2kmodule': {
            'load_wasm_module': load_wasm_module,
            'run_transform': run_transform,
        },
    };
    const wasmModuleInstance = await WebAssembly.instantiate(wasmModule, importObject);
    console.log('wasmModuleInstance', typeof wasmModuleInstance, wasmModuleInstance);
    WASM_INSTANCE = wasmModuleInstance;

    console.log('starting wasm');
    wasi.start(wasmModuleInstance);

    console.log('main done');
};

main().catch(console.error);
