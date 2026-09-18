package modelio

import (
	"encoding/json"
	"os"
	"testing"
	"web-app/Canvas/utils/graph"
)

// BenchmarkModelNavigation reads a caller-selected fixture without modifying it.
// EIN_MODEL_BENCH_PATH points to a folder containing its JSON/Python pair.
func BenchmarkModelNavigation(b *testing.B) {
	folder := os.Getenv("EIN_MODEL_BENCH_PATH")
	if folder == "" {
		b.Skip("set EIN_MODEL_BENCH_PATH to a saved model folder")
	}
	b.Run("load", func(b *testing.B) {
		b.ReportAllocs()
		for i := 0; i < b.N; i++ {
			if _, err := Load(folder); err != nil {
				b.Fatal(err)
			}
		}
	})
	data, err := Load(folder)
	if err != nil {
		b.Fatal(err)
	}
	s := graph.NewStore()
	p := s.ImportGraph(data, folder)
	b.Run("snapshot", func(b *testing.B) {
		b.ReportAllocs()
		for i := 0; i < b.N; i++ {
			p.GraphSnapshot()
		}
	})
	b.Run("response", func(b *testing.B) {
		b.ReportAllocs()
		for i := 0; i < b.N; i++ {
			raw, err := json.Marshal(p.GraphSnapshot())
			if err != nil {
				b.Fatal(err)
			}
			b.ReportMetric(float64(len(raw)), "bytes/response")
		}
	})
}
