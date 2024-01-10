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
	Type           string      `yaml:"type,omitempty" json:"type,omitempty"` // Default - Normal copy
	SrcPath        string      `yaml:"sourcePath" json:"sourcePath" m2kpath:"normal"`
	DestPath       string      `yaml:"destinationPath" json:"destinationPath" m2kpath:"normal"` // Relative to output directory
	TemplateConfig interface{} `yaml:"templateConfig" json:"templateConfig"`
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
	return nil, newArtifacts, nil
}

// func RunTransform(transformInputJson string) (string, int32) {

// https://github.com/tinygo-org/tinygo/issues/411#issuecomment-503066868
var keyToAllocatedBytes map[uint32][]byte
var nextKey uint32 = 41

//go:export myAllocate
func myAllocate(size uint32) *byte {
	nextKey += 1
	newArr := make([]byte, size)
	keyToAllocatedBytes[nextKey] = newArr
	return &newArr[0]
}

//export RunTransform
func RunTransform(transformInputJsonPtr uint32, transformInputJsonLen uint32) (string, int32) {
	transformInputJson := ptrToString(transformInputJsonPtr, transformInputJsonLen)
	input := TransformInput{}
	if err := json.Unmarshal([]byte(transformInputJson), &input); err != nil {
		return "", -1
	}
	ps, as, err := Transform(input.NewArtifacts, input.AlreadySeenArtifacts)
	if err != nil {
		return "", -1
	}
	output := TransformOutput{
		NewPathMappings: ps,
		NewArtifacts:    as,
	}
	outputJson, err := json.Marshal(output)
	if err != nil {
		return string(outputJson), -1
	}
	return string(outputJson), 0
}

func main() {
	// wasmexport hasn't been implemented yet
	// https://github.com/golang/go/issues/42372a
	args := os.Args
	fmt.Printf("args: %+v\n", args)
}
