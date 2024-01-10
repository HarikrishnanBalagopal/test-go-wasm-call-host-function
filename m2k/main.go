package main

import (
	"encoding/json"
	"fmt"
	"unsafe"
)

// PathMappingType refers to the Path Mapping type
type PathMappingType string

const (
	// DefaultPathMappingType allows normal copy with overwrite
	DefaultPathMappingType PathMappingType = "Default" // Normal Copy with overwrite
	// TemplatePathMappingType allows copy of source to destination and applying of template
	TemplatePathMappingType PathMappingType = "Template" // Source path when relative, is relative to yaml file location
	// SourcePathMappingType allows for copying of source directory to another directory
	SourcePathMappingType PathMappingType = "Source" // Source path becomes relative to source directory
	// DeletePathMappingType allows for deleting of files or folder directory
	DeletePathMappingType PathMappingType = "Delete" // Delete path becomes relative to source directory
	// ModifiedSourcePathMappingType allows for copying of deltas wrt source
	ModifiedSourcePathMappingType PathMappingType = "SourceDiff" // Source path becomes relative to source directory
	// PathTemplatePathMappingType allows for path template registration
	PathTemplatePathMappingType PathMappingType = "PathTemplate" // Path Template type
	// SpecialTemplatePathMappingType allows copy of source to destination and applying of template with custom delimiter
	SpecialTemplatePathMappingType PathMappingType = "SpecialTemplate" // Source path when relative, is relative to yaml file location
)

// Artifact represents the artifact that can be passed between transformers
type Artifact struct {
	Name string `yaml:"name,omitempty" json:"name,omitempty"`
	Type string `yaml:"type,omitempty" json:"type,omitempty"`
	// ProcessWith metav1.LabelSelector `yaml:"processWith,omitempty" json:"processWith,omitempty"` // Selector for choosing transformers that should process this artifact, empty is everything

	Paths   map[string][]string    `yaml:"paths,omitempty" json:"paths,omitempty" m2kpath:"normal"`
	Configs map[string]interface{} `yaml:"configs,omitempty" json:"configs,omitempty"` // Could be IR or template config or any custom configuration
}

// PathMapping is the mapping between source and intermediate files and output files
type PathMapping struct {
	Type           PathMappingType `yaml:"type,omitempty" json:"type,omitempty"` // Default - Normal copy
	SrcPath        string          `yaml:"sourcePath" json:"sourcePath" m2kpath:"normal"`
	DestPath       string          `yaml:"destinationPath" json:"destinationPath" m2kpath:"normal"` // Relative to output directory
	TemplateConfig interface{}     `yaml:"templateConfig" json:"templateConfig"`
}

type TransformInput struct {
	NewArtifacts         []Artifact `yaml:"newArtifacts,omitempty" json:"newArtifacts,omitempty"`
	AlreadySeenArtifacts []Artifact `yaml:"alreadySeenArtifacts,omitempty" json:"alreadySeenArtifacts,omitempty"`
}

type TransformOutput struct {
	NewPathMappings []PathMapping `yaml:"newPathMappings,omitempty" json:"newPathMappings,omitempty"`
	NewArtifacts    []Artifact    `yaml:"newArtifacts,omitempty" json:"newArtifacts,omitempty"`
}

//go:wasmimport mym2kmodule load_wasm_module
func load_wasm_module(ptr unsafe.Pointer, len uint32) int32

//go:wasmimport mym2kmodule run_transform
func run_transform(
	moduleId int32,
	ptr unsafe.Pointer,
	len uint32,
	outPtr unsafe.Pointer,
) int32

func loadWasmModule(path string) (int32, error) {
	result := load_wasm_module(unsafe.Pointer(&[]byte(path)[0]), uint32(len(path)))
	if result < 0 {
		return -1, fmt.Errorf("failed to load the custom transformer module")
	}
	return result, nil
}

// DirectoryDetect(dir string) (services map[string][]transformertypes.Artifact, err error)
// Transform(newArtifacts []transformertypes.Artifact, alreadySeenArtifacts []transformertypes.Artifact) ([]transformertypes.PathMapping, []transformertypes.Artifact, error)

// https://github.com/tinygo-org/tinygo/issues/411#issuecomment-503066868
var keyToAllocatedBytes = map[uint32][]byte{}
var nextKey uint32 = 41

func myAllocate(size uint32) *byte {
	nextKey += 1
	newArr := make([]byte, size)
	keyToAllocatedBytes[nextKey] = newArr
	return &newArr[0]
}

// func saveBytes(ptrBytes []byte) uint32 {
// 	nextKey += 1
// 	keyToAllocatedBytes[nextKey] = ptrBytes
// 	ptr := &ptrBytes[0]
// 	return uint32(uintptr(unsafe.Pointer(ptr)))
// }

const (
	// maxOutputLength TODO: this is hardcoded since we can't export myAllocate yet
	maxOutputLength uint32 = 8192
)

func runTransform(moduleId int32, input TransformInput) (TransformOutput, error) {
	output := TransformOutput{}
	inputJson, err := json.Marshal(input)
	if err != nil {
		return output, fmt.Errorf("failed to marshal as json. error: %w", err)
	}
	ptr := myAllocate(maxOutputLength)
	len := run_transform(
		moduleId,
		unsafe.Pointer(&[]byte(inputJson)[0]),
		uint32(len(inputJson)),
		unsafe.Pointer(ptr),
	)
	if len < 0 {
		return output, fmt.Errorf("failed to load the custom transformer module")
	}
	outputBytes := unsafe.Slice(ptr, len)
	if err := json.Unmarshal(outputBytes, &output); err != nil {
		return output, fmt.Errorf("failed to unmarshal as json. error: %w", err)
	}
	return output, nil
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
	output, err := runTransform(moduleId, input)
	if err != nil {
		panic(err)
	}
	fmt.Printf("Move2Kube transform output: %+v\n", output)
	fmt.Println("done")
}
