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

const ciovec_read_bytes = (view, ptr) => {
    const iovec = { buf: -1, buf_len: -1 };
    iovec.buf = view.getUint32(ptr, true);
    iovec.buf_len = view.getUint32(ptr + 4, true);
    return iovec;
};

const ciovec_read_bytes_array = (view, ptr, len) => {
    const iovecs = [];
    for (let i = 0; i < len; i++) {
        iovecs.push(ciovec_read_bytes(view, ptr + 8 * i));
    }
    return iovecs;
};

const main = async () => {
    console.log('main start');
    const res = await fetch('main.wasm');
    if (!res.ok) throw new Error('failed to fetch main.wasm');
    const wasmBytes = await res.arrayBuffer();
    const wasmModule = await WebAssembly.compile(wasmBytes);
    console.log('wasmModule', wasmModule);
    let fibWasmBytes = null;
    {
        const res = await fetch('fib.wasm');
        if (!res.ok) throw new Error('failed to fetch fib.wasm');
        fibWasmBytes = await res.arrayBuffer();
    }
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
        }),
    ];
    const wasi = new WASI(args, env, fds);

    // const wasm = await WebAssembly.compileStreaming(fetch("bin.wasm"));
    // let inst = await WebAssembly.instantiate(wasm, {
    //     "wasi_snapshot_preview1": wasi.wasiImport,
    // });
    // let WASM_MEMORY = null;
    let WASM_INSTANCE = null;
    const load_string = (ptr, len) => {
        if (!WASM_INSTANCE) throw new Error('the wasm instance is missing');
        const memory = new Uint8Array(WASM_INSTANCE.exports.memory.buffer);
        const buf = memory.slice(ptr, ptr + len);
        const decoder = new TextDecoder('utf-8');
        const s = decoder.decode(buf);
        // console.log('load_wasm_module called with:', s);
        return s;
    };
    // const load_wasm_module = (wasmModulePathPtr, wasmModulePathLength) => {
    //     // console.log('load_wasm_module wasmModulePathPtr', wasmModulePathPtr, 'wasmModulePathLength', wasmModulePathLength);
    //     // if (!WASM_MEMORY) throw new Error('the wasm memory is missing');
    //     if (!WASM_INSTANCE) throw new Error('the wasm instance is missing');
    //     // console.log('WASM_MEMORY', WASM_MEMORY, WASM_MEMORY.buffer.detached);
    //     // console.log('load_wasm_module WASM_INSTANCE', typeof WASM_INSTANCE, WASM_INSTANCE);
    //     const memory = new Uint8Array(WASM_INSTANCE.exports.memory.buffer);
    //     // console.log('load_wasm_module memory', memory, memory.length, memory.byteLength);
    //     const buf = memory.slice(wasmModulePathPtr, wasmModulePathPtr + wasmModulePathLength);
    //     const decoder = new TextDecoder('utf-8');
    //     const s = decoder.decode(buf);
    //     // console.log('load_wasm_module buf:', buf, 's:', s);
    //     console.log('load_wasm_module called with:', s);
    //     return 0;
    // };
    const load_wasm_module = (wasmModulePathPtr, wasmModulePathLength) => {
        const s = load_string(wasmModulePathPtr, wasmModulePathLength);
        console.log('load_wasm_module called with:', s);
        // const myModule = new WebAssembly.Module(wasmBytes);
        const myModule = new WebAssembly.Module(fibWasmBytes);
        const importObject = {
            'console': {
                'log': console.log
            }
        };
        const instance = new WebAssembly.Instance(myModule, importObject);
        console.log('compiled wasm and made an instance:', instance);
        return 42;
    };
    // TODO: preload modules because compile and instantiate are async operations
    // This also means that we have to unzip the archive in javascript
    // TODO: or use synchronous compilation new WebAssembly.Module(bufferSource)
    // https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/Module/Module
    // Warning: Since compilation for large modules can be expensive, developers
    // should only use the Module() constructor when synchronous compilation is
    // absolutely required; the asynchronous WebAssembly.compileStreaming()
    // method should be used at all other times.
    // TODO: and use sync instantiate new WebAssembly.Instance(module, importObject);
    // https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/Instance/Instance
    // Warning: Since instantiation for large modules can be expensive, developers should only use
    // the Instance() constructor when synchronous instantiation is absolutely required; the asynchronous
    // WebAssembly.instantiateStreaming() method should be used at all other times.
    const run_transform = (wasmModuleId, inputJsonPtr, inputJsonLength) => {
        const s = load_string(inputJsonPtr, inputJsonLength);
        const input = JSON.parse(s);
        console.log('run_transform called with: wasmModuleId:', wasmModuleId, 's:', s, 'input:', input);
        return 0;
    };
    // const orig_fn = wasi.wasiImport['fd_write'];
    // wasi.wasiImport['fd_write'] = (...args) => {
    //     console.log('fd_write args:', ...args);
    //     console.log('wasi.inst', wasi.inst === WASM_INSTANCE);
    //     const arrBuf = WASM_INSTANCE.exports.memory.buffer;
    //     console.log('arrBuf', arrBuf);
    //     const mem = new Uint8Array(arrBuf);
    //     console.log('mem', mem);
    //     const view = new DataView(arrBuf);
    //     const fd = args[0];
    //     const iovs_ptr = args[1];
    //     const iovs_len = args[2];
    //     const nwritten_ptr = args[3];
    //     console.log('fd', fd, 'iovs_ptr', iovs_ptr, 'iovs_len', iovs_len, 'nwritten_ptr', nwritten_ptr);
    //     const iovecs = ciovec_read_bytes_array(
    //         view,
    //         iovs_ptr,
    //         iovs_len,
    //     );
    //     console.log('iovecs', iovecs);
    //     for (let iovec of iovecs) {
    //         console.log('reading iovec', iovec);
    //         const b = mem.slice(iovec.buf, iovec.buf + iovec.buf_len);
    //         const decoder = new TextDecoder();
    //         const s = decoder.decode(b);
    //         console.log('reading iovec buffer', b, 's', s);
    //     }
    //     const result = orig_fn(...args);
    //     return result;
    // };
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
    // const memory = new Uint8Array(wasmModuleInstance.exports.memory.buffer);
    // console.log('memory', memory);
    // WASM_MEMORY = memory;

    console.log('starting wasm');
    wasi.start(wasmModuleInstance);
    // console.log('wasi.inst', wasi.inst, wasi.inst === WASM_INSTANCE);

    console.log('main done');
};

main().catch(console.error);
