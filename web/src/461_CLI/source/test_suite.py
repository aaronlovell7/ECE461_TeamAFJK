import json
import os
import unittest

from metrics_calc import (
    bus_factor_calc,
    correctness_calc,
    get_license,
    get_maintained,
    get_scores,
    graphql_metrics,
    norm,
    ramp_calc,
    rest_call,
    scorecard_call,
)

# import coverage


class TestStringMethods(unittest.TestCase):
    def test_restcall_good(self):
        rest_call(["lodash", "lodash"])
        self.assertEqual(os.path.exists("out/lodash_REST.json"), True)

    def test_restcall_bad(self):
        result = rest_call(["lodash", "lodash", 1])
        self.assertFalse(result)

    def test_scorecard_good(self):
        scorecard_call(["lodash", "lodash"])
        self.assertEqual(os.path.exists("out/lodash_scorecard.json"), True)

    def test_scorecard_license(self):
        scorecard_call(["lodash", "lodash"])
        with open("out/lodash_scorecard.json") as f:
            data = json.load(f)
        self.assertEqual(data["repo"]["name"], "github.com/lodash/lodash")

    def test_graphql_list(self):
        result = graphql_metrics(["lodash", "lodash"])
        self.assertEqual(len(result), 3)

    def test_graphql_ints(self):
        result = graphql_metrics(["lodash", "lodash"])
        for i in result:
            self.assertEqual(type(i), int)

    def test_maintained_good(self):
        result = get_maintained("out/lodash_scorecard.json")
        self.assertEqual(result, 0)

    def test_maintained_bad(self):
        result = get_maintained("out/cloudinary_npm_scorecard.json")
        self.assertGreater(result, 0)

    def test_licensing_good(self):
        result = get_license("out/lodash_scorecard.json")
        self.assertGreaterEqual(result, 0)

    def test_licensing_number(self):
        result = get_license("out/lodash_scorecard.json")
        self.assertEqual(result, 1)

    def test_ramp_good(self):
        result = ramp_calc(10, 5)
        self.assertEqual(result, 0.5)

    def test_ramp_zero(self):
        result = ramp_calc(0, 10)
        self.assertEqual(result, 0)

    def test_correctness_good(self):
        result = correctness_calc(5, 50)
        self.assertEqual(result, 10)

    def test_correctness_bad(self):
        result = correctness_calc(0, 10)
        self.assertEqual(result, 0.5)

    def test_bus_float_return(self):
        result = bus_factor_calc(["lodash", "lodash"])
        self.assertEqual(type(result), float)

    def test_bus_gt0(self):
        result = bus_factor_calc(["lodash", "lodash"])
        self.assertGreater(result, 0)

    def test_norm_good_int(self):
        res1 = norm(2)
        res2 = norm(5)
        self.assertGreater(res2, res1)

    def test_norm_good_decimal(self):
        res1 = norm(0.4)
        res2 = norm(0.7)
        self.assertGreater(res2, res1)

    def test_scores_good(self):
        result = get_scores(["cloudinary", "cloudinary_npm"])
        self.assertEqual(len(result), 6)

    def test_scores_bad(self):
        result = get_scores(["cloudinary", "cloudinary_npm"])
        for i in result:
            self.assertLessEqual(i, 1)
