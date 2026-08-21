"""Batch cosine-similarity kernel for Yana's optional memory accelerator."""

from std.math import sqrt
from std.os import abort
from std.python import PythonObject
from std.python.bindings import PythonModuleBuilder


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
    query: PythonObject, candidates: PythonObject
) raises -> PythonObject:
    var scores: PythonObject = []
    var query_len = len(query)

    for row_index in range(len(candidates)):
        var candidate = candidates[row_index]
        if query_len == 0 or len(candidate) != query_len:
            scores.append(0.0)
            continue

        var dot = 0.0
        var norm_query = 0.0
        var norm_candidate = 0.0
        for column_index in range(query_len):
            var query_value = Float64(py=query[column_index])
            var candidate_value = Float64(py=candidate[column_index])
            dot += query_value * candidate_value
            norm_query += query_value * query_value
            norm_candidate += candidate_value * candidate_value

        if norm_query == 0.0 or norm_candidate == 0.0:
            scores.append(0.0)
        else:
            scores.append(dot / (sqrt(norm_query) * sqrt(norm_candidate)))

    return scores
