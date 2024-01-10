.PHONY: build
build:
	# GOARCH=wasm GOOS=wasip1 go build -o main.wasm
	tinygo build -o maintiny.wasm -target=wasi main.go
	wasm2wat maintiny.wasm > maintiny.wat
