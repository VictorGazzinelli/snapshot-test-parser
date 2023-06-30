const axios = require('axios');
const fs = require('fs');
const path = require('path');
const unzipper = require('unzipper');
const Papa = require('papaparse');
const glob = require('glob');
const mv = require('mv');
const rimraf = require('rimraf');
const readline = require('readline');


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
			// move specific Jest files to a new directory inside 'repository-jest-files'
			const repositoryJestFilesPath = path.join(reposPath, 'repository-jest-files');
			if (!fs.existsSync(repositoryJestFilesPath)){
				fs.mkdirSync(repositoryJestFilesPath);
			}
	
			const jestFilesDestinationPath = path.join(repositoryJestFilesPath, `${repoName}-jest-files`);
			if (!fs.existsSync(jestFilesDestinationPath)){
				fs.mkdirSync(jestFilesDestinationPath);
			}
			let isMovingDone = false;
	
			const jestFilesExtensions = ['.js', '.jsx', '.ts', '.tsx', '.test.js', '.test.jsx', '.test.ts', '.test.tsx', '.spec.js', '.spec.jsx', '.spec.ts', '.spec.tsx', /*'.json',*/ '.mock.js', '.mock.jsx', '.mock.ts', '.mock.tsx', '.snap'];
			jestFilesExtensions.forEach((ext) => {
				console.log(`Moving files with extension ${ext} ...`);
				glob(`${unzipPath}/**/*${ext}`, function (er, files) {
					console.log(`Found ${files.length} files with extension ${ext}`);
					files.forEach((filePath) => {
						console.log(`Checking file ${filePath} ...`);

						if(filePath.endsWith('.snap')) {
							const fileName = path.basename(filePath);
							const destinationPath = path.join(jestFilesDestinationPath, fileName);
							mv(filePath, destinationPath, function(err) {
								if (err) {
									console.log(`Error moving file: ${err}`);
								}
							});
							return;
						}
						try{
							const fileContent = fs.readFileSync(filePath, 'utf8');
							
							// Check if fileContent includes snapshot methods
							if ((fileContent.includes('.toMatchSnapshot()') || fileContent.includes('.toMatchInlineSnapshot()')) && !filePath.endsWith('.snap')) {
								console.log(`Moving file ${filePath} ...`);
								const fileName = path.basename(filePath);
								const destinationPath = path.join(jestFilesDestinationPath, fileName);
								mv(filePath, destinationPath, function(err) {
									if (err) {
										console.log(`Error moving file: ${err}`);
									} else {
										// If successfully moved the test file, also look for and move the .snap file.
										const snapFilePath = filePath + '.snap';
										if (fs.existsSync(snapFilePath)) {
											const snapFileName = path.basename(snapFilePath);
											const snapDestinationPath = path.join(jestFilesDestinationPath, snapFileName);
											mv(snapFilePath, snapDestinationPath, function(err) {
												if (err) {
													console.log(`Error moving snapshot file: ${err}`);
												}
											});
										}
									}
								});
							}
						} catch (err) {
							console.log(`Error reading file: ${err}`);
						}
					});
					isMovingDone = true;
				});
				console.log(`Moved files with extension ${ext}`);
			});

			// Timeout necessary to wait for the files to be moved
			// Delete the downloaded repo
			const afterAll = () => {
				if(isMovingDone) {
					fs.unlink(zipPath, function() {
						console.log(`Deleted ${zipPath}`);
					});
					
					fs.rmdir(unzipPath, { recursive: true }, function() {
						console.log(`Deleted ${unzipPath}`);
					});

				  fs.readdir(jestFilesDestinationPath, (err, files) => {
					if(err) {
					  console.log(`Error reading directory: ${err}`);
					  return;
					}
					if(files.length === 0) {
					  // If no files are present, rename the directory
					  const newDirectoryPath = path.join(repositoryJestFilesPath, `NONE-${repoName}-jest-files`);
					  fs.renameSync(jestFilesDestinationPath, newDirectoryPath, function(err) {
						if(err) {
						  console.log(`Error renaming directory: ${err}`);
						}
					  });
					}
				  });
				} else {
				  setTimeout(afterAll, 1000); // check again in 1 second
				}
			  };

			  setTimeout(() => {
				  afterAll();
			  }, 2000);
			
	
			rowCount++;
		});
    } 
    
    parser.resume();
}

Papa.parse(file, {
	step: stepFn,
	preview: 50,
});