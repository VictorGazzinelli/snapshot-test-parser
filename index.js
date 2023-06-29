const axios = require('axios');
const fs = require('fs');
const path = require('path');
const unzipper = require('unzipper');
const Papa = require('papaparse');

const checkUrl = async (url) => {
	try {
        const response = await axios.get(url);
		return true;
	}
	catch (error) {
		return false;
	}	
};

const downloadRepo = async (url, pathToSave) => {
	const writer = fs.createWriteStream(pathToSave);
  
	const response = await axios({
	  url,
	  method: 'GET',
	  responseType: 'stream',
	});
  
	response.data.pipe(writer);
  
	return new Promise((resolve, reject) => {
	  writer.on('finish', resolve);
	  writer.on('error', reject);
	});
};

const csvPath = path.join(__dirname, 'data-snapshot-testing-28022023-hasSnapshotFiles.csv');
const file = fs.createReadStream(csvPath);
const reposPath = path.join(__dirname, 'repos');

if (!fs.existsSync(reposPath)){
    fs.mkdirSync(reposPath);
}

let rowCount = 0;

async function stepFn(result, parser) {
    parser.pause();

	if(rowCount === 0) {
		rowCount++;
		parser.resume();
		return;
	}

    if (result.data) {
		const repoUrl = result.data[6];
		const repoName = repoUrl.split('/').pop();
		const masterZipRepoUrl = path.join(repoUrl, 'archive/refs/heads/master.zip');
		const mainZipRepoUrl = path.join(repoUrl, 'archive/refs/heads/main.zip');
		const mainZipRepoUrlExists = await checkUrl(mainZipRepoUrl);
		const zipRepoUrl = mainZipRepoUrlExists ? mainZipRepoUrl : masterZipRepoUrl;
		const zipPath = path.join(reposPath, `${repoName}.zip`);
		const unzipPath = path.join(reposPath, repoName);
		console.log(`Repo ${repoUrl} ...`);
		await downloadRepo(zipRepoUrl, zipPath)
		const file = fs.createReadStream(zipPath);
		file.pipe(unzipper.Extract({ path: unzipPath }));
		file.on('end', function() {
			fs.unlink(zipPath, function() {
				console.log(`Deleted ${zipPath}`);
			});
		  });
		rowCount++;
    } 
    
    parser.resume();
}

Papa.parse(file, {
	step: stepFn,
	preview: 5,
});