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
    const mainTinyRes = await fetch('maintiny.wasm');
    if (!mainTinyRes.ok) throw new Error('failed to fetch fib.wasm');
    const mainTinyBytes = await mainTinyRes.arrayBuffer();
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
            "customizations": new PreopenDirectory("customizations", {
                "my-custom-transformer-1": new PreopenDirectory("my-custom-transformer-1", {
                    // "my-transformer.wasm": new File(new Uint8Array(fibWasmBytes)),
                    "fib.wasm": new File(new Uint8Array(fibWasmBytes)),
                    "my-transformer.wasm": new File(new Uint8Array(mainTinyBytes)),
                }),
            }),
        }),
    ];
    const wasi = new WASI(args, env, fds);

    let WASM_INSTANCE = null;
    const load_string = (ptr, len) => {
        if (!WASM_INSTANCE) throw new Error('load_string: the wasm instance is missing');
        const memory = new Uint8Array(WASM_INSTANCE.exports.memory.buffer);
        const buf = memory.slice(ptr, ptr + len);
        const decoder = new TextDecoder('utf-8');
        const s = decoder.decode(buf);
        return { buf, s };
    };
    const store_bytes = (bytes, ptr) => {
        if (!WASM_INSTANCE) throw new Error('store_bytes: the wasm instance is missing');
        const memory = new Uint8Array(WASM_INSTANCE.exports.memory.buffer);
        memory.set(bytes, ptr);
    };
    let NEW_MODULE_ID = 41;
    const MODULE_MAP = {};
    const load_wasm_module = (wasmModulePathPtr, wasmModulePathLength) => {
        const { s: wasmModulePath } = load_string(wasmModulePathPtr, wasmModulePathLength);
        console.log('load_wasm_module called with path:', wasmModulePath);
        let currDirectoryOrFile = fds[3].dir.contents;
        wasmModulePath.split('/').forEach(p => {
            if (p === '') return;
            console.log('looking for folder/file', p);
            if (!(p in currDirectoryOrFile)) throw new Error('load_wasm_module: failed to find the wasm module');
            console.log('before currDirectoryOrFile', currDirectoryOrFile, typeof currDirectoryOrFile);
            currDirectoryOrFile = currDirectoryOrFile[p];
            if (currDirectoryOrFile instanceof PreopenDirectory) {
                currDirectoryOrFile = currDirectoryOrFile.dir.contents;
            }
            console.log('after currDirectoryOrFile', currDirectoryOrFile);
        });
        if (!(currDirectoryOrFile instanceof File)) throw new Error('load_wasm_module: the given path is not a file');
        const wasmModuleBytes = currDirectoryOrFile.data;
        console.log('load_wasm_module: wasmModuleBytes', wasmModuleBytes);
        // https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/Module/Module
        const myModule = new WebAssembly.Module(wasmModuleBytes);
        // const importObject = {
        //     'console': {
        //         'log': console.log
        //     }
        // };
        const importObject = {
            "wasi_snapshot_preview1": wasi.wasiImport,
        };
        // https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/Instance/Instance
        const instance = new WebAssembly.Instance(myModule, importObject);
        console.log('load_wasm_module: compiled wasm and made an instance:', instance);
        const new_key = ++NEW_MODULE_ID;
        MODULE_MAP[new_key] = instance;
        return new_key;
    };
    const run_transform = (wasmModuleId, inputJsonPtr, inputJsonLength, outputJsonPtr) => {
        if (!(wasmModuleId in MODULE_MAP)) throw new Error('wasm module not loaded');
        const wasmModule = MODULE_MAP[wasmModuleId];
        const { buf, s } = load_string(inputJsonPtr, inputJsonLength);
        console.log('run_transform: load_string buf', buf, 's', s);
        const input = JSON.parse(s);
        console.log('run_transform called with: wasmModuleId:', wasmModuleId, 'wasmModule', wasmModule, 's:', s, 'input:', input);
        console.log('wasmModule.exports.myAllocate', wasmModule.exports.myAllocate);
        console.log('wasmModule.exports.RunTransform', wasmModule.exports.RunTransform);
        const len = s.length;
        console.log('run_transform: allocate some memory of size', len);
        const ptr = wasmModule.exports.myAllocate(len);
        console.log('run_transform: ptr', ptr, 'len', len);
        if (ptr < 0) throw new Error('failed to allocate, invalid pointer into memory');
        let memory = new Uint8Array(wasmModule.exports.memory.buffer);
        memory.set(buf, ptr);
        console.log('run_transform: json input set at ptr', ptr);

        console.log('run_transform: allocate space for the output pointers');
        const ptrptr = wasmModule.exports.myAllocate(8); // 2 uint32 values
        console.log('run_transform: ptrptr', ptrptr);
        if (ptrptr < 0) throw new Error('failed to allocate, invalid pointer into memory');

        const result = wasmModule.exports.RunTransform(ptr, len, ptrptr, ptrptr + 4);
        console.log('run_transform: transformation result', result);
        if (result < 0) throw new Error('run_transform: transformation failed');
        const outJsonPtr = new DataView(wasmModule.exports.memory.buffer, ptrptr, 4).getUint32(0, true);
        const outJsonLen = new DataView(wasmModule.exports.memory.buffer, ptrptr + 4, 4).getUint32(0, true);
        console.log('run_transform: transformation outJsonPtr', outJsonPtr, 'outJsonLen', outJsonLen);
        memory = new Uint8Array(wasmModule.exports.memory.buffer);
        console.log('run_transform: memory', memory);
        const outJsonBytes = memory.slice(outJsonPtr, outJsonPtr + outJsonLen);
        console.log('run_transform: outJsonBytes', outJsonBytes);
        const outJson = new TextDecoder('utf-8').decode(outJsonBytes);
        console.log('run_transform: outJson', outJson);
        const outJsonParsed = JSON.parse(outJson);
        console.log('run_transform: outJsonParsed', outJsonParsed);
        store_bytes(outJsonBytes, outputJsonPtr);
        // return 0;
        return outJsonBytes.length;
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
