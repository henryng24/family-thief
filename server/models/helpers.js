var Sequelize = require('sequelize');
var User = require('./user.js');
var Project = require('./project.js');
var ProjectUpvote = require('./projectupvotes.js');
var Contribution = require('./contributions.js');
var ContributionUpvote = require('./contributionupvotes.js');
var ContributionComment = require('./contributioncomments.js');
var ProjectComment = require('./projectcomments.js');
var associations = require('./associations.js');
var jwt = require('jsonwebtoken');

module.exports.authenticate = function(username, password, response, secret) {
  User.find({where: {username: username}}).then(function(user) {
    if(user) {

      if (user.checkPassword(password)) {
        var profile = {
          username: user.username,
          email: user.email
        };
        console.log("User authenticated!");
        response.json({token: jwt.sign(profile, secret, { expiresInMinutes: 60 * 5})});
      } else {
        console.log("Bad Password, Charlie");
        response.send(401, "Wrong username or password");
      }
    } else {

      console.log("Whoops, user doesn't exsist");
      response.send(401, "Wrong username or password");

    }
  });
};


module.exports.findAllInfo = function(username, response) {
  //finding the logged in user
  User.find({where: {username:username}}).then(function(user){
    if (user) {
      //finding all their projects
      Project.findAll({where: {user_id: user.id}}).then(function(allProjects){
        var projectsArray = [];
        var uniqueProjects = [];
        for (var i = 0; i < allProjects.length; i++) {
          projectsArray.push(allProjects[i].dataValues);
          var projectId = allProjects[i].dataValues.id;
          uniqueProjects.push(projectId);
        }
        //finding all their contributions
        Contribution.findAll({where: {contributor: user.id}}).then(function(allContributions) {
          var contributionsArray = [];
          var uniqueContributions = [];
          for (var j = 0; j< allContributions.length; j ++) {
            contributionsArray.push(allContributions[j].dataValues);
            var contributionId = allContributions[j].dataValues.id;
            if (uniqueContributions.indexOf(contributionId) < 0) {
              uniqueContributions.push(contributionId);
            }
          }
          //finding and counting all unseenhelprequests
            Contribution.findAndCountAll({where:{project: uniqueProjects, unseenHelp: true}}).then(function(unseenHelps) {
              //finding and counting all unseencomments from projects
              ProjectComment.findAndCountAll({where:{projectCommented: uniqueProjects, unseenComment: false}}).then(function(unseenProjectComments) {
                //finding and counting all unseencomments from contributions
                ContributionComment.findAndCountAll({where:{contributionCommented: uniqueContributions, unseenComment: false}}).then(function(unseenContributionComments) {
                  //finding and counting all votes for projects
                    ProjectUpvote.findAndCountAll({where:{projectupvoted: uniqueProjects}}).then(function(projectUpvotes) {
                      //finding and counting all votes for contributions
                      ContributionUpvote.findAndCountAll({where: {contributionupvoted: uniqueContributions}}).then(function(contributionUpvotes) {
                        //finding all the contributions for a user - joint search
                        Contribution.findAll({where: {contributor: user.id}, include:[User]}).then(function(userContributions) {
                          var contributionDetails = [];
                          for (var k = 0 ; k < userContributions.length; k++ ) {
                            contributionDetails.push({
                              id: userContributions[k].dataValues.id,
                              helperUsername: userContributions[0].dataValues.User.dataValues.username,
                              textSnippet: userContributions[k].dataValues.contributionText,
                              origDate: userContributions[k].dataValues.createdAt
                              });
                          };
                          var profile = {
                            username: user.username,
                            email: user.email,
                            helpRequests: projectsArray,
                            contributions: contributionDetails,
                            numberUnseenHelps: unseenHelps.count,
                            numberUnseenComments: unseenProjectComments.count + unseenContributionComments.count,
                            votes: projectUpvotes.count + contributionUpvotes.count
                          }
                          console.log("Delivering profile");
                          response.json(profile);
                        });
                      });
                    });
                });
              });
            });
        });
      });
    } else {
      response.send(401, "Error - how can you not be found when logged in?");
    }
  })
};

module.exports.searchOrMake = function(username, email, password, response, secret) {
  User.find({where: {username: username}}).then(function(user) {
    if(user) {
      console.log('User exists');
      response.send(401, "That user already exists!");
    } else {
      User.create({username: username, email: email}).then(function(user) {
        user.password = user.setPassword(password);
        var profile = {
          username: user.username,
          email: user.email
        };
        console.log("User created");
        response.json({token: jwt.sign(profile, secret, { expiresInMinutes: 60 * 5})});
      })
    }
  });
};

module.exports.helpRequest = function(username, project, response) {
  User.find({where: {username: username}}).then(function(user) {
    if(user) {
      Project.create({title: project.title, summary: project.summary, text: project.text, user_id: user.id}).then(function(createdProject) {
        var projectDetails = {
          id: createdProject.id,
          title: createdProject.title,
          summary: createdProject.summary,
          origDate: createdProject.createdAt
        };
        console.log("Passing back token");
        response.json(projectDetails);
      })
    } else {
        console.log("Error while creating project");
    }
  });
};

module.exports.projectUpvote = function(userId, projectId, response) {
  ProjectUpvote.find({where: {upvoter: userId, projectupvoted: projectId}}).then(function(projectUpvoted) {
    if (projectUpvoted) {
        response.send(201, "You voted already");
      } else {
        ProjectUpvote.create({upvoter: userId, projectupvoted: projectId}).then(function() {
            response.send(201, "Project upvoted");
        })
      }
  });
};

module.exports.viewProject = function(projectId, response) {
  Project.find({where: {id: projectId}, include: [User]}).then(function(project) {
    if(project) {
      Contribution.findAll({where: {project: projectId}, include:[User]}).then(function(projectContributions) {
        var contributionDetails = [];
        for (var k = 0 ; k < projectContributions.length; k++ ) {
          contributionDetails.push({
            id: projectContributions[k].dataValues.id,
            username: project.dataValues.User.dataValues.username,
            helperUsername: projectContributions[k].dataValues.User.dataValues.username,
            textSnippet: projectContributions[k].dataValues.contributionText,
            origDate: projectContributions[k].dataValues.createdAt
            });
        };
        ProjectUpvote.findAndCountAll({where:{projectupvoted: projectId}}).then(function(projectvotes) {

          var projectDetails = {
            title: project.title,
            summary: project.summary,
            text: project.text,
            username: project.dataValues.User.dataValues.username,
            votes: projectvotes.count,
            contributions: contributionDetails,
            origDate: project.createdAt
          };
          console.log("Showing project details");
          response.json(projectDetails);
        });
      });
    } else {
        console.log("Error while finding project");
    }
  });
};

module.exports.makeContribution = function(username, contribution, response) {
  User.find({where: {username: username}}).then(function(user) {
    if(user) {
      Contribution.create({contributor: user.id, project: contribution.helpedId, contributionText: contribution.text, unseenHelp: true}).then(function(contributionCreated) {
          Project.find({where: {id: contribution.helpedId}, include:[User]}).then(function(project) {
          var projectDetails = {
            id: contributionCreated.id,
            helpedUsername: project.dataValues.User.dataValues.username,
            title: project.title,
            summary: project.summary,
            origDate: project.createdAt
          }
        response.json(projectDetails);
          });
      });
    } else {
        console.log("Error while making contribution");
    }
  });
};

module.exports.contributionComment = function(contribution, response) {
  User.find({where: {username: contribution.commenter}}).then(function(user) {
    if(user) {
      ContributionComment.create({comment: contribution.text, unseenComment: false, commenter: user.id, contributionCommented: contribution.contributionId}).then(function() {
        response.send(201, "Contribution comment made");
      });
    } else {
        console.log("Error while making contribution comment");
    }
  });
};

module.exports.contributionUpvote = function(userId, contributionId, response) {
  ContributionUpvote.find({where: {upvoter: userId, contributionupvoted: contributionId}}).then(function(contributionUpvoted) {
    if (contributionUpvoted) {
      response.send(201, "You voted already");
    } else {
  ContributionUpvote.create({upvoter: userId, contributionupvoted: contributionId}).then(function() {
      response.send(201, "Contribution upvoted");
    })
    }
  })
};

module.exports.viewContribution = function(contributionId, decoded, response) {
  Contribution.find({where: {id: contributionId}}).then(function(contribution) {
    if(contribution) {
      ContributionComment.findAll({where: {contributionCommented: contributionId}, include: [User]}).then(function(contributionComments) {
        var allContributionComments = [];
        for (var i = 0; i < contributionComments.length; i++) {
          allContributionComments.push({
            comment: contributionComments[i].dataValues.comment,
            unseenComment: contributionComments[i].dataValues.unseenComment,
            commenter: contributionComments[i].dataValues.User.username,
            origDate: contributionComments[i].dataValues.createdAt
          });
        }
        Project.find({where: {id: contribution.project}}).then(function(project) {
          User.find({where: {id: contribution.contributor}}).then(function(contributingUser) {
            User.find({where: {id: project.user_id}}).then(function(helpedUser) {
              ContributionUpvote.findAndCountAll({where:{contributionupvoted: contributionId}}).then(function(contributionvotes) {
                var contributionDetails = {
                  contributionText: contribution.contributionText,
                  comments: allContributionComments,
                  date: contribution.createdAt,
                  helpRequestText: project.text,
                  contributor: contributingUser.username,
                  userHelped: helpedUser.username,
                  votes: contributionvotes.count
                };
                console.log("Showing contribution details");
                if (decoded.username === helpedUser.username) {
                  console.log("Help request owner has seen!");
                  contribution.update({unseenHelp : false}).then(function(){
                    response.json(contributionDetails);
                  });

                } else {
                  response.json(contributionDetails);
                }

              });
            });
          });
        });
      });
    } else {
        console.log("Error while finding contribution");
    }
  });
};

module.exports.searching = function(searchString, response) {
  Project.findAll({where: ["title LIKE ? or summary LIKE ?", '%' + searchString+ '%', '%' + searchString+ '%'] }).then(function(projects) {
    if (projects) {
      var results = [];
      var projectLength;
      if (projects.length > 10) {
        projectLength = 10;
      } else {
        projectLength = projects.length;
      }
      for (var i = 0; i < projectLength; i ++) {
        results.push({
          id: projects[i].dataValues.id,
          title: projects[i].dataValues.title,
          summary: projects[i].dataValues.summary,
          origDate: projects[i].dataValues.createdAt
        })
      }
      console.log("Sending back search results");
      response.json(results);
    } else {
      console.log("No search results");
    }
  });
};

module.exports.getAll = function(response) {
  Project.findAll({include: [User]}).then(function(projects) {
    var allProjects = [];
    for (var i = 0; i < projects.length; i ++) {
      allProjects.push({
        id: projects[i].dataValues.id,
        title: projects[i].dataValues.title,
        summary: projects[i].dataValues.summary,
        origDate: projects[i].dataValues.createdAt,
        username: projects[i].dataValues.User.dataValues.username
      })
    }
    response.json(allProjects);
  });
}

module.exports.checkUnseenContributions = function(username, response) {
  User.find({where: {username: username}}).then(function(user) {
    Project.findAll({where: {user_id: user.dataValues.id}}).then(function(userProjects){
      var uniqueProjects = [];
      for (var i = 0; i < userProjects.length; i ++) {
        var projectId = userProjects[i].dataValues.id;
        if (uniqueProjects.indexOf(projectId) < 0) {
          uniqueProjects.push(projectId);
        }
      }
      Contribution.findAll({where: {project: uniqueProjects}, include: [Project, User]}).then(function(projectContributions) {
        var contributionDetails = [];
        for (var j = 0; j < projectContributions.length; j++) {
          contributionDetails.push({
            contributor: projectContributions[j].dataValues.User.dataValues.username,
            contributionId: projectContributions[j].dataValues.id,
            contributionText: projectContributions[j].dataValues.contributionText,
            title: projectContributions[j].dataValues.Project.dataValues.title,
            unseen: projectContributions[j].dataValues.unseenHelp
          });
        }
        response.json(contributionDetails);
      });
    });
  });
}
