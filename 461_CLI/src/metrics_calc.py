import json
import re
import subprocess

# import sys


# calls rest API typescript file, given args ([owner, repo])
def rest_call(args):
    # produces json outputs for rest api given inputted url
    if len(args) != 2:
        return False
    subprocess.run(["node", "src/github-api.js"] + args)
    return


# calls rest API for fraction of code from reviewed PRs
def merge_percentage(args):
    if len(args) != 2:
        return False
    subprocess.run(["node", "src/merge-percentage.js"] + args)

    return


# calls scorecard function, given args ([owner, repo])
def scorecard_call(args):
    subprocess.run(["node", "src/scorecard.js"] + args, stdout=subprocess.PIPE).stdout
    return


# returns metrics from graphql function, given args ([owner, repo])
def graphql_metrics(args):
    gql_metrics = str(
        subprocess.run(["node", "src/graphql.js"] + args, stdout=subprocess.PIPE).stdout
    )
    gql_metrics = gql_metrics.split(", ")
    # metrics_stripping = gql_metrics.decode().strip()
    # gql_metrics = int(metrics_stripping[0])
    for idx, i in enumerate(gql_metrics):
        gql_metrics[idx] = int(re.sub("[^0-9]", "", i))

    # gql_metrics is a 3 element array containing, # of forks, # of subscribers, and # of issues, respectively
    return gql_metrics


# returns maintained score as determined by scorecard functionality, if no maintain is availble, returns score of 0
def get_maintained(filename):
    with open(filename) as f:
        data = json.load(f)

    location = data["checks"]
    mscore = 0

    for i in location:
        for key, value in i.items():
            # Check if the field name is equal to "name"
            if key == "name" and value == "Maintained":
                # If the name is equal, print the value
                # print(i['score'])
                if "score" in i:
                    mscore = i["score"]
                return mscore

    return mscore


# returns 1 when url contains a license, or 0 when no license is found
def get_license(filename):
    with open(filename) as f:
        data = json.load(f)

    location = data["checks"]

    for i in location:
        for key, value in i.items():
            if key == "name" and value == "License":
                if "score" in i:
                    return 1
                else:
                    return 0


# get merge percentage for repo
def get_merge_percentage(filename):
    with open(filename) as f:
        data = json.load(f)

    return data


# ramp up calculation, determined by # of forks, # of issues
# based off assumption that the ratio correlates to how easy of a fix the issues may be
def ramp_calc(issues, forks):
    if issues != 0:
        ramp_score = forks / issues
    else:
        ramp_score = 0
    return ramp_score


# correctness calculation, determined by # of issues and # of subscribers
# based off assumption that the ratio of subscribers to issues would be lower, if repo contains more issues
def correctness_calc(issues, subs):
    if issues != 0:
        correctness_score = subs / issues
    else:
        correctness_score = 0.5
        # our metric cannot accurately account for this
    return correctness_score


# bus factor calculation, determined by # of contributors
# based off assumption that "ideal" number of SWE on a team is 7, so number of contributors/7
# would correlate to how many are necessary for success in repo
def bus_factor_calc(args):
    contributors = subprocess.run(
        ["node", "src/contributors.js"] + args, stdout=subprocess.PIPE
    ).stdout
    contributors = contributors.decode().strip()
    contributors = int(contributors)
    bus_factor_score = contributors / 7
    # 7 is chosen based on "magic number" for SWE team size via google
    return bus_factor_score


# Pinned version calculation, determined by number of pinned versions within package.json.
# Percentage of pinned to total dependencies
def version_calc(args):
    versions = subprocess.run(
        ["node", "src/Version.js"] + args, stdout=subprocess.PIPE
    ).stdout
    versions_score = versions.decode().strip()
    versions_score = float(versions_score)
    return versions_score


# normalization to 1 function
def norm(value):
    return 1 - (1 / (1 + value))


# get scores function, determined by args ([owner, repo])
def get_scores(args):
    # call to initialize rest api output file
    rest_call(args)

    # call to merge percentage statistic
    merge_percentage(args)

    # call to initialize scorecard output file
    scorecard_call(args)

    # determination of # of forks, # of subs, and # of issues metrics, used for other metric calculations
    forks, subs, issues = graphql_metrics(args)

    # ramp up score call, returns ramp up score, normalizes to 1
    ramp_score = ramp_calc(issues, forks)
    norm_ramp = norm(ramp_score)

    # correctness score call, returns correctness score, normalizes to 1
    correctness = correctness_calc(issues, subs)
    norm_correct = norm(correctness)

    # bus factor score call, returns bus factor score, normalizes to 1
    bus_factor = bus_factor_calc(args)
    norm_bf = norm(bus_factor)

    # Version score call, returns version score, normalizes to 1
    versions = version_calc(args)

    # initializes filename of scorecard, given repo argument
    filename = "out/" + args[1] + "_scorecard.json"

    # init merge percentage filename
    mp_filename = "out/" + args[1] + "_MERGE_PERCENTAGE.json"
    mp = get_merge_percentage(mp_filename)

    # maintained score call, returns maintained score, normalizes if score is not 0, otherwise returns 0
    maintained = get_maintained(filename)
    if maintained != 0:
        norm_maintained = norm(maintained)
    else:
        norm_maintained = 0

    # licensed score call, returns whether repo is licensed (returns 1), or not (returns 0)
    # therefore, no normalization is needed
    licensed = get_license(filename)

    # net score calculation, determined by average of all normalized scores
    net_score = (
        norm_ramp + norm_correct + norm_bf + licensed + norm_maintained + versions + mp
    ) / 7

    # array initialization for net and individial scores (normalized, or stated otherwise)
    # return array of values for use in output
    scores = [
        net_score,
        norm_ramp,
        norm_correct,
        norm_bf,
        licensed,
        norm_maintained,
        versions,
        mp,
    ]
    return scores
