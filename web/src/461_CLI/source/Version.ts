import axios from 'axios';
import { environment } from '../environment/environment';

const args = process.argv.slice(2)

export async function getVersions(owner, repo) {
    // Request package.json using axios
    const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/contents/package.json`, {
        headers: {
            'Authorization': `Token ${environment.GITHUB_TOKEN}`
        }
    });

    // Decode contents from base64 encoding to string 
    const buf = Buffer.from(response.data.content, 'base64').toString('utf8');

    // Parse JSON format so depencies field can be grabbed
    const buf2 = JSON.parse(buf);

    // Get depencies field
    const dependencies = buf2.dependencies;

    let tot_dep:number = 0;
    let tot_pin:number = 0;
    let score:number = 0;

    // If dependencies do exist 
    if(!(dependencies == undefined)) {
        // Get values inside depencies field and load into list
        const dep_array:string[] = Object.values(dependencies);

        // Loop through list of dependencies
        for(let i = 0; i<dep_array.length; i++) {
            // If has ^ or *, then it is not pinned 
            if(dep_array[i][0] == '^' || dep_array[i][0] == '*') {
                tot_dep++;
            }
            // If has ~, it is pinned
            else if(dep_array[i][0] == '~') {
                tot_dep++;
                tot_pin++
            }
            // Have to check each field if not other cases. This is case where we see 1.X or 1.1.X for example
            else {
                // Split using . delimiter 
                let arr:string[] = dep_array[i].split(".");
                // If has 3 numbers, it is pinned to specific major+minor
                if(arr.length == 3) {
                    tot_pin++;
                    tot_dep++;
                }
                // If has less numbers, not pinned
                else {
                    tot_dep++;
                }
            }
        }

        // Score is percentage of pinned dependencies
        score = tot_pin / tot_dep;
    }
    
    // If no dependencies, score is 1 per requirements
    if (tot_dep == 0) score = 1;

    // Log score for stdout to be grabbed in python script
    console.log(score);
  }
  
// Call function with owner and repo args sent in
getVersions(args[0], args[1]);