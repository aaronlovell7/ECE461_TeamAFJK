import axios from 'axios';
//import { environment } from '../environment/environment';

const GITHUB_BASE = 'https://api.github.com';


// Gather arguments (owner, repo) from call to file
const args = process.argv.slice(2)
const fs = require('fs');


axios.defaults.validateStatus = function () {
    return true;
};

// Function gathers all data available from call to GitHub API about a given repo
// Produces JSON output file that is used later in the program. 
async function getMergePercentage(owner: string, repo: string): Promise<any> {
    let num_pulls = 0;
    const response1 = await axios.get(`${GITHUB_BASE}/repos/${owner}/${repo}/pulls`, {
        headers: {
        Authorization: `Token ${process.env.GITHUB_TOKEN}`,
        },
    });

    // Keep track of the number of correctly reviewed/merged pulls and the number of undefined PRs (when return value from axios is null)
    let num_reviewed_pulls = 0;
    let num_undefined_pulls = 0;

    let isMerged:any;
    let isReviewed:any;

    try
    {
        // determine if the we will count the last 100 PRs, or the first 100
        num_pulls = response1['data'][0]['number'];

        let target:number;
        let total:number;
        if(num_pulls > 100)
        {
            target = num_pulls - 100;
            total = 100;
        }
        else
        {
            target = num_pulls;
            total = num_pulls;
        }

        // loop through the last 100 PRs
        num_reviewed_pulls = 2;
        num_undefined_pulls = 0;
        for( let i = num_pulls; i > target; i--)
        {
            try 
            {
                const response = await axios.get(`${GITHUB_BASE}/repos/${owner}/${repo}/pulls/${i}`, {
                    headers: {
                    Authorization: `Token ${process.env.GITHUB_TOKEN}`
                    },
                });
    
                isMerged = response['data']['merged'];
                isReviewed = response['data']['requested_reviewers'].length + response['data']['assignees'].length;

                // increment the counter if the PR has been merged AND reviewed
                if(isMerged && isReviewed)
                {
                    num_reviewed_pulls += 1;
                }

            } 
            catch (error)     
            {
                // if the API call failed, increment the num_undefined variable
                num_undefined_pulls += 1;
            }

        }
        
        // returns the number of correct PRs divided by the total number (excluding the undefined ones)
        return Math.min((10*num_reviewed_pulls) / (total - num_undefined_pulls), 1);
    }     
 
    catch(error) 
    {
        // go from 1 to 100 or x amount in row null
        for( let i = 1; i < 100; i++) 
        {
            try
            {
                const response = await axios.get(`${GITHUB_BASE}/repos/${owner}/${repo}/pulls/${i}`, {
                    headers: {
                    Authorization: `Token ${process.env.GITHUB_TOKEN}`,
                    },
                });

                isMerged = response['data']['merged'];
                isReviewed = response['data']['requested_reviewers'].length

                if(isMerged && isReviewed)
                {
                    num_reviewed_pulls += 1;
                }
                
            } 
            catch (error)     
            {
                //console.error(error);
                num_undefined_pulls += 1;
            }

        }
    }

    return num_reviewed_pulls / (100 - num_undefined_pulls);
}

// Main function obtains information about a repository and creates a JSON output file
async function main() {
    //const owner = await getMergePercentage("aaronlovell7", "ECE461TeamAFJK");
    //const owner = await getMergePercetange("cloudinary", "cloudinary_npm");
    const merge_percentage = await getMergePercentage(args[0], args[1]);
    //console.log(merge_percentage);
    fs.writeFileSync('out/' + args[1] + '_MERGE_PERCENTAGE.json', JSON.stringify(merge_percentage, null, 2));
}
  
main();
