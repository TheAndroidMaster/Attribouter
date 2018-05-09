#!/usr/bin/env node
'use strict';

const _program = require('commander'),
	_inquirer = require('inquirer'),
	_chalk = require('chalk'),
	_exec = require('child_process').exec,
	_fs = require('fs'),
	_path = "src/main/res/values/xml/$",
	_xml = require('xml-parse'),
	_http = require('http'),
	_request = require('request'),
	_opn = require('opn'),
	_private = require("./private"),
	_github = require('github-oauth')({
		githubClient: _private._githubClient,
		githubSecret: _private._githubSecret,
		baseURL: 'http://127.0.0.1:8080',
		loginURI: '/login',
		callbackURI: '/callback',
		scope: ''
	});

console.log(_private._githubClient);

_program.version('1.0.0');
_program.parse(process.argv);

let path = ".";
let paths = _path.split("/");
for (let i = 0; i < paths.length - 2; i++) {
	path += "/" + paths[i];
	if (!_fs.existsSync(path)) {
		console.log("> " + _chalk.red.bold("Unable to find the directory \"" + path + "\""));
		return;
	}
}

var gitHubToken = null;
var isNewConfig = true;
var defaultRepo = null;

function nextThing(data) {
	_inquirer.prompt([{
		type: 'list',
		name: 'element',
		message: "Which item would you like to edit?",
		choices: ["appInfo", "contributors", "licenses", "Done."]
	}]).then(answers => {
		if (answers.element == "appInfo") {
			let appInfoChoices = function() {
				let items = [];
				for (let i = 0; i < data.childNodes.length; i++) {
					if (data.childNodes[i].tagName == "appInfo")
						items.push("index: " + i + ", title: " + data.childNodes[i].attributes.title);
				}
				items.push("Create a new one.");
				return items;
			};
			
			_inquirer.prompt([{
				type: 'input',
				name: 'repo',
				message: "What repository (format: \"login/repo\", or \"null\") would you like to fetch your app\'s info from?",
				default: defaultRepo,
				validate: function(value) {
					return (value == "null" || (value.indexOf("/") > 1 && !value.endsWith("/"))) || "Please specify the repository name in the format \"login/repo\", or type \"null\".";
				}
			},{
				type: 'list',
				name: 'index',
				message: "There are multiple <appInfo> elements in your file. Which one would you like to edit?",
				default: "Create a new one.",
				choices: appInfoChoices,
				filter: function(value) {
					return value.startsWith("index: ") ? Number.parseInt(value.substring(7, value.indexOf(","))) : null;		
				},
				when: function(answers) {
					return answers.repo && appInfoChoices().length > 1;
				}
			}]).then((answers) => {
				if (answers.repo) {
					defaultRepo = answers.repo;

					console.log("> Fetching GitHub data...");
					_request({
						url: "https://api.github.com/repos/" + answers.repo,
						headers: {
							Authorization: gitHubToken ? "bearer " + gitHubToken : null,
							"User-Agent": "Attribouter-cli"
						}
					}, (err, res, body) => {
						if (err) {
							console.log("> Error fetching data from https://api.github.com/repos/" + answers.repo);
							console.error(err);
							nextThing(data);
							return;
						}

						let jsonBody = JSON.parse(body);

						if (answers.index) {
							console.log("> " + _chalk.blue.bold("Modifying the <appInfo> element at [" + answers.index + "]."));
						} else {
							console.log("> " + _chalk.blue.bold("Creating a new <appInfo> element."));
							answers.index = data.childNodes.length;
							data.childNodes.push({
								type: "element",
								tagName: "appInfo",
								attributes: {},
								childNodes: [],
								closing: true,
								closingChar: null
							});
						}

						let prompts = [];
						let map = {
							"full_name": "repo",
							"description": "description",
							"homepage": function() {
								return jsonBody.homepage.startsWith("https://play.google.com/") ? "playStoreUrl" : "websiteUrl";
							},
							"gitHubUrl": "html_url"
						}

						for (let key in map) {
							let name = typeof map[key] === "function" ? map[key]() : map[key];
							let val = data.childNodes[answers.index].attributes[name];
							if (jsonBody[key] && jsonBody[key].length > 0 && jsonBody[key] != val) {
								prompts.push({
									type: 'input',
									name: name,
									message: "Change " + name + " attribute from \"" + val + "\" to...",
									default: jsonBody[key]
								});
							}
						}

						_inquirer.prompt(prompts).then((answers2) => {
							for (let key in answers2) {
								data.childNodes[answers.index].attributes[key] = answers2[key];
							}
							
							console.log("> " + _chalk.green.bold("appInfo element updated."));
							nextThing(data);
						});						
					});
				} else nextThing(data);
			});
		} else if (answers.element == "contributors") {
				let contributorsChoices = function() {
					let items = [];
					for (let i = 0; i < data.childNodes.length; i++) {
						if (data.childNodes[i].tagName == "contributors")
							items.push("index: " + i + ", title: " + data.childNodes[i].attributes.title);
					}
					items.push("Create a new one.");
					return items;
				};
		
				_inquirer.prompt([{
					type: 'input',
					name: 'repo',
					message: "What repository (format: \"login/repo\", or \"null\") would you like to fetch contributors from?",
					default: defaultRepo,
					validate: function(value) {
						return (value == "null" || (value.indexOf("/") > 1 && !value.endsWith("/"))) || "Please specify the repository name in the format \"login/repo\", or type \"null\".";
					}
				},{
					type: 'list',
					name: 'index',
					message: "There are multiple <contributors> elements in your file. Which one would you like to edit?",
					default: "Create a new one.",
					choices: contributorsChoices,
					filter: function(value) {
						return value.startsWith("index: ") ? Number.parseInt(value.substring(7, value.indexOf(","))) : null;		
					},
					when: function(answers) {
						return answers.repo && contributorsChoices().length > 1;
					}
				}]).then((answers) => {
					if (answers.repo) {
						defaultRepo = answers.repo;

						console.log("> Fetching GitHub data...");
						_request({
							url: "https://api.github.com/repos/" + answers.repo + "/contributors?per_page=1000",
							headers: {
								Authorization: gitHubToken ? "bearer " + gitHubToken : null,
								"User-Agent": "Attribouter-cli"
							}
						}, (err, res, body) => {
							if (err) {
								console.log("> Error fetching data from https://api.github.com/repos/" + answers.repo + "/contributors");
								console.error(err);
								nextThing(data);
								return;
							}

							let jsonBody = JSON.parse(body);

							if (answers.index) {
								console.log("> " + _chalk.blue.bold("Modifying the <contributors> element at [" + answers.index + "]."));
							} else {
								console.log("> " + _chalk.blue.bold("Creating a new <contributors> element."));
								answers.index = data.childNodes.length;
								data.childNodes.push({
									type: "element",
									tagName: "contributors",
									attributes: {},
									childNodes: [],
									closing: true,
									closingChar: null
								});
							}

							if (jsonBody.length > 0)
								nextContributor(data, answers.index, jsonBody);
							else {
								console.log("> No contributors were returned from GitHub.");
								nextThing(data);
								return;
							}
						});
					} else nextThing(data);
				});
		} else if (answers.element == "licenses") {
		} else {
			//write to file & exit
		}
	});
}

function nextContributor(data, index, contributors) {
	if (contributors[0]) {
		console.log("> Fetching more GitHub data...");
		
		_request({
			url: "https://api.github.com/users/" + contributors[0].login,
			headers: {
				Authorization: gitHubToken ? "bearer " + gitHubToken : null,
				"User-Agent": "Attribouter-cli"
			}
		}, (err, res, body) => {
			if (err) {
				console.log("> Error fetching data from https://api.github.com/users/" + contributors[csIndex].login);
				console.error(err);
				contributors.splice(0, 1);
				nextContributor(data, index, contributors);
				return;
			}

			let jsonBody = JSON.parse(body);
			let contributorChoices = function() {
				let items = [];
				for (let i = 0; i < data.childNodes[index].childNodes.length; i++) {
					items.push("index: " + i + ", login: " + data.childNodes[index].childNodes[i].attributes.login + ", name: " + data.childNodes[index].childNodes[i].attributes.name);
				}
				items.push("Create a new one.");
				return items;
			};

			_inquirer.prompt([{
				type: 'list',
				name: 'index',
				message: "Which contributor would you like to modify with the data from [" + jsonBody.login + "]?",
				choices: contributorChoices,
				default: function() {
					let choices = contributorChoices();
					for (let i = 0; i < choices.length; i++) {
						if (choices[i].substring(16 + (i + "").length).startsWith(jsonBody.login))
							return choices[i];
					}

					return choices[choices.length - 1];
				},
				filter: function(value) {
					return value.startsWith("index: ") ? Number.parseInt(value.substring(7, value.indexOf(","))) : null;		
				},
				when: contributorChoices().length > 1
			}]).then((answers) => {
				if (answers.index) {
					console.log("> " + _chalk.blue.bold("Modifying <contributor> at [" + answers.index + "] for [" + jsonBody.login + "]"));
				} else {
					console.log("> " + _chalk.blue.bold("Creating a new <contributor> for [" + jsonBody.login + "]"));
					answers.index = data.childNodes[index].childNodes.length;
					data.childNodes[index].childNodes.push({
						type: "element",
						tagName: "contributors",
						attributes: {},
						childNodes: [],
						closing: true,
						closingChar: null
					});
				}

				let prompts = [];
				let map = {
					"login": "login",
					"name": "name",
					"avatar_url": "avatar",
					"bio": "bio",
					"blog": "blog",
					"email": "email"
				}

				for (let key in map) {
					let val = data.childNodes[index].childNodes[answers.index].attributes[map[key]];
					if (jsonBody[key] && jsonBody[key].length > 0 && jsonBody[key] != val) {
						prompts.push({
							type: 'input',
							name: map[key],
							message: "Change " + map[key] + " attribute from \"" + val + "\" to...",
							default: jsonBody[key]
						});
					}
				}
				
				_inquirer.prompt(prompts).then((answers2) => {
					for (let key in answers2) {
						data.childNodes[index].childNodes[answers.index].attributes[key] = answers2[key];
					}
												
					console.log("> " + _chalk.green("contributor element for [" + jsonBody.login + "] updated."));
					contributors.splice(0, 1);
					nextContributor(data, index, contributors);
				});
			});
		});
	} else {
		console.log("> " + _chalk.green.bold("contributors element updated."));
		nextThing(data);
	}
}

function prompt(token) {
	_inquirer.prompt([{
		type: 'input',
		name: 'fileName',
		message: "What is the name of the XML file to create / modify?",
		default: "attribouter.xml",
		filter: function(value) {
			return value.endsWith(".xml") ? value : value + ".xml";
		}
	}]).then(answers => {
		var data = _fs.existsSync(_path.replace("$", answers.fileName)) ? _xml.parse(_fs.readFileSync(_path.replace("$", answers.fileName))) : null;
		if (data) {
			console.log("> An existing config file has been found, this tool will now attempt to update the existing data.");
			isNewConfig = false;
			for (let i = 0; i < data.length; i++) {
				if (data[i].tagName == "about") {
					data = data[i];
					break;
				}
			}
		} else {
			console.log("> No existing config file has been found, this tool will now begin creating a new file.");
			data = {
				type: 'element',
				tagName: 'about',
				attributes: {},
				childNodes: [],
				closing: true,
				closingChar: null
			};
		}
		
		nextThing(data);
	});
}

const _server = _http.createServer(function(req, res) {
	if (req.url.match("/login") || req.url.match("/login/")) 
		return _github.login(req, res);
		
	if (req.url.match("/callback?") || req.url.match("/callback/")) {
		console.log("> Verifying auth token...");
		return _github.callback(req, res);
	}
});
_server.listen(8080);

_github.on('error', function(error) {
	_server.close();
	console.log("> There was an error signing in. Request limits will be in place, and you run into issues fetching certain information from GitHub.");
	prompt();
});

_github.on('token', function(token, response) {
	_server.close();
	console.log("> " + _chalk.green.bold("You have been successfully signed in. Requests are now authenticated."));
	prompt(token.access_token);
});

console.log("> On the next page, please sign in with your GitHub account in order to authenticate requests and bypass the rate limits.");
console.log("> Attempting to open " + _chalk.blue("http://127.0.0.1:8080/login/") + "...");
_opn("http://127.0.0.1:8080/login/");