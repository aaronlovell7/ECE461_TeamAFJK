# ECE 461 Module Registry Project

<img align="right" width="200" height="200" src="https://raw.githubusercontent.com/aaronlovell7/ECE461_TeamAFJK/main/Purdue_Seal.png">

## Team Members
1. Aaron Lovell   (https://www.linkedin.com/in/heath-aaron-lovell/)
2. Fred Kepler    (https://www.linkedin.com/in/frederick-j-kepler-iv/)
3. Jack Stavrakos (https://www.linkedin.com/in/jackstavrakos/)
4. Kevin Hasier   (https://www.linkedin.com/in/kevin-hasier/)


## Project Overview
This 8-week project is a trustworthy module registry for ACME Corp. We have designed a web browser interface that was hosted on Google Cloud Platform. We developed HTML code for the website in the html folder. The server code and related models and routes are in their respective folders within the src folder. The server code is an Open-API (Swagger) specification. We inherited a command line interface (CLI) from another group that queries GitHub using Axios for information on GitHub repositories. It then uses this data to rate the packages on several metrics: Ramp Up, Correctness, Bus Factor, Responsiveness of Maintainers, License compatibility, Version pinning, and percentage of merges made through pull request. With this code, we developed the server code to allow for the uploading, updating, downloading, rating, searching, resetting, and tracking of open source GitHub and NPM modules. We implemented a database for storing these modules using the MongoDB framework. 

## Uploading
Users can upload a zip file which is sent to the server code as a base64 encoded string or they can supply a GitHub or NPM URL to request it to be ingested. If ingestion is requested, the package is rated using the inherited code. If the package receives a score of 50% or better on all metrics, it is allowed to be ingested. A package can be uploaded with a javascript program that will be run ona download request. We call these modules sensitive modules. This allows ACME to designate modules as sensitive which adds restrictions to the ability to download it, as well as tracks certain action on that package. If a sensitive package successfully uploads, a history entry is created with the user, date, package metadata, and 'UPLOAD' tag. 

## Updating
Users can update modules by providing a complete new package. The name and version supplied in the metadata must match the ones in the package saved to the database. The content field would be updated if the name and version matched. If the module is sensitive, a history entry is created with the user, date, package metadata, and 'UPDATE' tag. 

## Downloading
Users can request a module to be downloaded to their local filesystem by providing a name and version which is then translated into an internal ID using a package search functionality. The module is then decoded from base64 into a zip file and downloads it. If the module is sensitive, the JSProgram field is written to a .js file and executed using a child process. If the code exits with a nonzero code, the download of the module is rejected. If it exits with a 0 code, the download is allowed. If it is allowed, a new history entry is created with the user, date, package metadata, and 'DOWNLOAD' tag.

## Rating
### Overview
Users can request a package to be rated. This uses the inherited code as well as some new metrics (version pinning and percentage of pull requests) to codnuct this rating. If the module is sensitive, a new history entry is created with the user, date, package metadata, and 'RATE' tag.
### Metric Calculations
#### NetScore
The NetScore of a package or module is be determined by averaging all of the following metrics described below.
#### RampUp
We determine the RampUp time by obtaining the number of open issues on the GitHub repository of the package, along with the number of forks. The ratio between these two values can suggest how quickly issues may be resolved. The determined score will be normalized with respect to 1.
#### Correctness
We determine the Correctness metric by first obtaining the number of open issues that the repository of the package or module has, as well as the number of subscribers. The Correctness score is obtained from the normalization of the ratio between these two metrics within the range [0, 1].
#### BusFactor
The BusFactor metric is calculated using the ratio between the amount of contributors that a repository  has and the "sweet spot" for a team of software engineers, determined to be 7 (as detailed by Google). This value will be normalized to 1.
#### ResponsiveMaintainer
This metric will come directly from the `Maintenance` score provided by the Scorecard API. This score will be normalized to 1.
#### License
Like the maintenance metric, the License metric will be obtained directly from the Scorecard API. The range of scores for this metric are also in the range [0, 1], however the score will always be either 1 or 0 corresponding to whether or not the package has licensing, respectively.
#### Version Pinning
This metric queries GitHub for the package.json to find the dependencies. It then parses it and loops through the dependencies to determine if it is pinned to a specific major+minor version. The score is calculated by dividing the number of pinned dependencies by the total number of dependencies. We prefer to have pinned dependencies as this guarantees the module will work as expected as it was tested with that version of the dependencies. 
#### Percentage of Pull Requests
This metric queries GitHub to determine how many pull requests use a reviewer to determine whether or not that was a reviewed PR. The information is gathered from the last 100 PRs, or if there are less than 100, all of the total PRs. It then returns the number of correct PRs divided by the total number, not including the undefined ones.

### Searching
Users can request a search of packages in the registry by providing a name and version. They can provide an array of these couplings. The endpoint then goes through the queries one by one and satisfies them. This endpoint also allows for pagination so once the pagesize of 10 modules is reached, the endpoint will stop searching and return an offset value in the response header for the next request to be made for the next page of results. Searching can also be done by RegEx.

### Resetting
Users can reset the database back to it's initial state. The initial state ensures the default user is recreated. Anything that could be saved to the database is deleted. 

### Tracking
Users can see the history of a sensitive module. This endpoint will find all the history entries created by the upload, update, rate, and download endpoints. A package can also be deleted by its name using this functionality. This allows ACME to maintain non-repudiation with their sensitive modules. 