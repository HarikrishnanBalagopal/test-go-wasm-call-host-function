package main

import (
	"encoding/json"
	"fmt"
	"os"
	"unsafe"
)

// https://github.com/ejcx/wazero/blob/40f59a877bcdb4949eba51f9e1dee3deaba1ff83/examples/allocation/tinygo/testdata/greet.go#L64C1-L68C2
// ptrToString returns a string from WebAssembly compatible numeric types
// representing its pointer and length.
func ptrToString(ptr uint32, size uint32) string {
	return unsafe.String((*byte)(unsafe.Pointer(uintptr(ptr))), size)
}

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

func Transform(newArtifacts []Artifact, alreadySeenArtifacts []Artifact) ([]PathMapping, []Artifact, error) {
	ps := []PathMapping{{
		Type:     TemplatePathMappingType,
		SrcPath:  "Dockerfile.tpl",
		DestPath: "Dockerfile",
		TemplateConfig: map[string]string{
			"Port": "8080",
		},
	}}
	for i := range newArtifacts {
		newArtifacts[i].Name = "new-name-from-custom-transformer"
	}
	return ps, newArtifacts, nil
}

// func RunTransform(transformInputJson string) (string, int32) {

// https://github.com/tinygo-org/tinygo/issues/411#issuecomment-503066868
var keyToAllocatedBytes = map[uint32][]byte{}
var nextKey uint32 = 41

//go:export myAllocate
func myAllocate(size uint32) *byte {
	nextKey += 1
	newArr := make([]byte, size)
	keyToAllocatedBytes[nextKey] = newArr
	return &newArr[0]
}

func saveBytes(ptrBytes []byte) uint32 {
	nextKey += 1
	keyToAllocatedBytes[nextKey] = ptrBytes
	ptr := &ptrBytes[0]
	return uint32(uintptr(unsafe.Pointer(ptr)))
}

//export RunTransform
func RunTransform(
	transformInputJsonPtr uint32,
	transformInputJsonLen uint32,
	transformOutputJsonPtr uint32,
	transformOutputJsonLen uint32,
) int32 {
	transformInputJson := ptrToString(transformInputJsonPtr, transformInputJsonLen)
	input := TransformInput{}
	if err := json.Unmarshal([]byte(transformInputJson), &input); err != nil {
		fmt.Println("mycustomtransformer: failed to unmarshal")
		// panic("mycustomtransformer: failed to unmarshal")
		return -1
	}
	ps, as, err := Transform(input.NewArtifacts, input.AlreadySeenArtifacts)
	if err != nil {
		fmt.Println("mycustomtransformer: failed to transform")
		// panic("mycustomtransformer: failed to transform")
		return -1
	}
	output := TransformOutput{
		NewPathMappings: ps,
		NewArtifacts:    as,
	}
	outputJson, err := json.Marshal(output)
	if err != nil {
		fmt.Println("mycustomtransformer: failed to marshal")
		// panic("mycustomtransformer: failed to marshal")
		return -1
	}
	ptr := saveBytes(outputJson)
	ptrr := (*uint32)(unsafe.Pointer(uintptr(transformOutputJsonPtr)))
	*ptrr = ptr
	ptrl := (*uint32)(unsafe.Pointer(uintptr(transformOutputJsonLen)))
	*ptrl = uint32(len(outputJson))
	return 0
}

func main() {
	// wasmexport hasn't been implemented yet
	// https://github.com/golang/go/issues/42372a
	args := os.Args
	fmt.Printf("args: %+v\n", args)
}
