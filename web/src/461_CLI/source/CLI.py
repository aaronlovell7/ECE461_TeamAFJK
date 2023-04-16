import json
import subprocess
import sys

from metrics_calc import get_scores

# user input url
url = sys.argv[1]

# split url into arguments to pass to typescript for api (respective to url type)
url_elements = url.split("/")

# implemented when user enters github url
if "github.com" in url_elements:
    owner = url_elements[3]
    repo = url_elements[4]
    args = [owner, repo]
    scores = get_scores(args)
# implemented when user enters npmjs url
elif "www.npmjs.com" in url_elements:
    owner = url_elements[4]
    args = [owner]
    url_out = str(
        subprocess.run(
            ["node", "461_CLI/source/npmjs-api.js"] + args, stdout=subprocess.PIPE
        ).stdout
    )
    url_parts = url_out.split("/")
    owner = url_parts[3]
    repo_withgit = url_parts[4]
    repo_parts = repo_withgit.split(".git")
    repo = repo_parts[0]
    args = [owner, repo]
    scores = get_scores(args)
else:
    print("URL entered is invalid. Try again.")

# Creating dictionary with scoring entries for JSON output
output = dict()
output["URL"] = str(url)
output["NET_SCORE"] = "{:.1f}".format(scores[0])
output["RAMP_UP_SCORE"] = "{:.1f}".format(scores[1])
output["CORRECTNESS_SCORE"] = "{:.1f}".format(scores[2])
output["BUS_FACTOR_SCORE"] = "{:.1f}".format(scores[3])
output["LICENSE_SCORE"] = str(0 if scores[4] < 1 else 1)
output["RESPONSIVE_MAINTAINER_SCORE"] = "{:.1f}".format(scores[5])
output["VERSION_SCORE"] = "{:.1f}".format(scores[6])
output["CODE_REVIEWED_PERCENTAGE"] = "{:.1f}".format(scores[7])

# Print dictionaries in JSON format
print(json.dumps(output))
