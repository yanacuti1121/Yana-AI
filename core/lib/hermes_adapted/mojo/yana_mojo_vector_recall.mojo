"""Batch cosine-similarity kernel for Yana's optional memory accelerator."""

from std.collections import List
from std.math import sqrt
from std.memory import UnsafePointer
from std.os import abort
from std.python import PythonObject
from std.python.bindings import PythonModuleBuilder
from std.sys import simd_width_of


@export
def PyInit_yana_mojo_vector_recall() abi("C") -> PythonObject:
    try:
        var module = PythonModuleBuilder("yana_mojo_vector_recall")
        module.def_function[cosine_scores](
            "cosine_scores",
            docstring="Return one cosine-similarity score per candidate vector.",
        )
        return module.finalize()
    except error:
        abort(String("error creating yana_mojo_vector_recall: ", error))


def cosine_scores(
    query: PythonObject,
    candidates: PythonObject,
    candidate_norms: PythonObject,
) raises -> PythonObject:
    var scores: PythonObject = []
    var query_len = len(query)
    var candidate_count = len(candidates)

    if len(candidate_norms) != candidate_count:
        raise Error("candidate norm count does not match candidate count")

    if query_len == 0:
        for _ in range(candidate_count):
            scores.append(0.0)
        return scores

    if candidate_count == 0:
        return scores

    var query_values = List[Float64](capacity=query_len)
    var query_norm_squared = 0.0
    for column_index in range(query_len):
        var query_value = Float64(py=query[column_index])
        query_values.append(query_value)
        query_norm_squared += query_value * query_value

    var flat_candidates = List[Float64](capacity=candidate_count * query_len)
    var native_norms = List[Float64](capacity=candidate_count)
    for row_index in range(candidate_count):
        var candidate = candidates[row_index]
        if len(candidate) != query_len:
            native_norms.append(0.0)
            for _ in range(query_len):
                flat_candidates.append(0.0)
            continue

        native_norms.append(Float64(py=candidate_norms[row_index]))
        for column_index in range(query_len):
            flat_candidates.append(Float64(py=candidate[column_index]))

    var query_norm = sqrt(query_norm_squared)
    var query_ptr = UnsafePointer(to=query_values[0])
    var candidate_ptr = UnsafePointer(to=flat_candidates[0])
    comptime simd_width = simd_width_of[DType.float64]()
    var simd_limit = (query_len // simd_width) * simd_width

    for row_index in range(candidate_count):
        var candidate_norm = native_norms[row_index]
        if query_norm == 0.0 or candidate_norm == 0.0:
            scores.append(0.0)
            continue

        var dot = 0.0
        var row_offset = row_index * query_len
        var column_index = 0
        while column_index < simd_limit:
            var products = (
                query_ptr.load[width=simd_width](column_index)
                * candidate_ptr.load[width=simd_width](row_offset + column_index)
            )
            for lane in range(simd_width):
                dot += products[lane]
            column_index += simd_width

        while column_index < query_len:
            dot += query_values[column_index] * flat_candidates[
                row_offset + column_index
            ]
            column_index += 1

        scores.append(dot / (query_norm * candidate_norm))

    return scores
