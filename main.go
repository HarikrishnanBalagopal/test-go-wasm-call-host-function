package main

import (
	"encoding/json"
	"fmt"
	"unsafe"
)

// Artifact represents the artifact that can be passed between transformers
type Artifact struct {
	Name string `yaml:"name,omitempty" json:"name,omitempty"`
	Type string `yaml:"type,omitempty" json:"type,omitempty"`
	// ProcessWith metav1.LabelSelector `yaml:"processWith,omitempty" json:"processWith,omitempty"` // Selector for choosing transformers that should process this artifact, empty is everything

	Paths   map[string][]string    `yaml:"paths,omitempty" json:"paths,omitempty" m2kpath:"normal"`
	Configs map[string]interface{} `yaml:"configs,omitempty" json:"configs,omitempty"` // Could be IR or template config or any custom configuration
}

type TransformInput struct {
	NewArtifacts         []Artifact `yaml:"newArtifacts,omitempty" json:"newArtifacts,omitempty"`
	AlreadySeenArtifacts []Artifact `yaml:"alreadySeenArtifacts,omitempty" json:"alreadySeenArtifacts,omitempty"`
}

//go:wasmimport mym2kmodule load_wasm_module
func load_wasm_module(ptr unsafe.Pointer, len int32) int32

//go:wasmimport mym2kmodule run_transform
func run_transform(moduleId int32, ptr unsafe.Pointer, len int32) int32

func loadWasmModule(path string) (int32, error) {
	result := load_wasm_module(unsafe.Pointer(&[]byte(path)[0]), int32(len(path)))
	if result < 0 {
		return -1, fmt.Errorf("failed to load the custom transformer module")
	}
	return result, nil
}

// DirectoryDetect(dir string) (services map[string][]transformertypes.Artifact, err error)
// Transform(newArtifacts []transformertypes.Artifact, alreadySeenArtifacts []transformertypes.Artifact) ([]transformertypes.PathMapping, []transformertypes.Artifact, error)

func runTransform(moduleId int32, input TransformInput) error {
	inputJson, err := json.Marshal(input)
	if err != nil {
		return fmt.Errorf("failed to marshal as json. error: %w", err)
	}
	if run_transform(moduleId, unsafe.Pointer(&[]byte(inputJson)[0]), int32(len(inputJson))) < 0 {
		return fmt.Errorf("failed to load the custom transformer module")
	}
	return nil
}

func main() {
	fmt.Println("start")
	customTransformerWasmPath := "/customizations/my-custom-transformer-1/my-transformer.wasm"
	moduleId, err := loadWasmModule(customTransformerWasmPath)
	if err != nil {
		panic(err)
	}
	input := TransformInput{
		NewArtifacts: []Artifact{{
			Name: "artifact-1",
			Type: "service",
		}},
	}
	if err := runTransform(moduleId, input); err != nil {
		panic(err)
	}
	fmt.Println("done")
}
