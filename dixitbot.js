const Discord = require("discord.js");
var images = require("images");

var bot = new Discord.Client();

var gameInProgress = false;
var awaitingStory = false;
var awaitingCards = false;
var awaitingVotes = false;

var textChannel;

const DECK_SIZE = 106;
var deckOfCards;
var deckCursor;
var players;
var playerCursor;
var story;
var correctVote;
var playersIndexedByVote;

/*
	GAME LOGIC
*/
function initializeGame(members) {
	//shuffle deck, DECK_SIZE cards total
	deckOfCards = [];
	deckCursor = 0;
	for (var i = 0; i < DECK_SIZE; i++) {
		deckOfCards[i] = i;
	}
	shuffle(deckOfCards);
	
	//deal player hands, 6 cards each
	players = [];
	playerCursor = 0;
	for (var i = 0; i < members.length; i++) {
		players[i] = new Object();
		players[i].id = members[i].id;
		players[i].name = members[i].user.username;
		players[i].submittedCard = false;
		players[i].submittedVote = false;
		players[i].score = 0;
		players[i].hand = [];
		for (var j = 0; j < 6; j++) {
			players[i].hand[j] = drawCard();
		}
		sendPlayerHand(i);
	}
	players[playerCursor].submittedVote = -1;
	story = "";
	correctVote = -1;
	gameInProgress = true;
	//initiate first turn
	nextTurn();
}

function drawCard() {
	var card = deckOfCards[deckCursor];
	deckCursor++;
	return card;
}

function sendSubmittedCards() {
	var submitted = [];
	for (var i = 0; i < players.length; i++) {
		submitted[i] = players[i].submittedCard;
	}
	shuffle(submitted);
	playersIndexedByVote = [];
	for (var i = 0; i < players.length; i++) {
		if (submitted[i] == players[playerCursor].submittedCard)
			correctVote = i;
		// build playersIndexedByVote
		for (var j = 0; j < players.length; j++) {
			if (submitted[i] == players[j].submittedCard)
				playersIndexedByVote[i] = j;
		}
	}
	sendHandImage(submitted, textChannel);
}
function sendPlayerHand(playerIndex) {
	var member = textChannel.members.get(players[playerIndex].id);
	var hand = players[playerIndex].hand;
	sendHandImage(hand, member);
}
function sendHandImage(handArray, sendTo) {
	var length = handArray.length;
	var handFile = images(300*length, 435)
		.encode("jpg", {operation:50});
	for (var i = 0; i < length; i++) {
		handFile = images(handFile)
			.draw(images("dixit_images/card" + handArray[i] + ".jpg").size(300), 300*i, 0)
			.draw(images("dixit_images/dixit_number_" + (i+1) + ".jpg").size(50), (300*i+235), 370)
			.encode("jpg", {operation:50});
	}
	sendTo.sendFile(handFile);
}

function nextTurn() {
	// have storyteller enter prompt
	var stName = players[playerCursor].name;
	var msg = stName + " is the storyteller.\n" +
		"They will provide a sentence to match one of their cards.";
	textChannel.sendMessage(msg);
	awaitingStory = true;
}

function calculateAndShowResults() {
	// if nobody or everybody finds correct card, st scores 0,
	//	other players score 2
	// else st and players who found card score 3	
	var allCorrect = true;
	var noneCorrect = true;
	for (var i = 0; i < players.length; i++) {
		if (i == playerCursor)
			continue;
		if (players[i].submittedVote == correctVote)
			noneCorrect = false;
		else {
			allCorrect = false;
			// players other than st score 1 point for every vote for their own card
			var curPlayer = playersIndexedByVote[players[i].submittedVote];
			players[curPlayer].score += 1;
		}
	}
	if (allCorrect || noneCorrect) {
		for (var i = 0; i < players.length; i++) {
			if (i == playerCursor)
				continue;
			players[i].score += 2;
		}
	}
	else {
		for (var i = 0; i < players.length; i++) {
			if (i == playerCursor)
				players[i].score += 3;
			else if (players[i].submittedVote == correctVote)
				players[i].score += 3;
		}
	}
	showResults();
	updateScoreboard();	
}

function showResults() {
	var resultMsg = "Results:\n\n";
	resultMsg += "Correct answer: " + (correctVote+1) + "\n\n";
	for (var i = 0; i < players.length; i++) {
		if (i == playerCursor)
			continue;
		resultMsg += players[i].name + " voted: " + (players[i].submittedVote+1) + "\n";
	}
	textChannel.sendMessage(resultMsg);
}

function updateScoreboard() {
	var scoreboard = "CURRENT SCORES:\n\n";
	for (var i = 0; i < players.length; i++) {
		scoreboard += players[i].name + " --> " + players[i].score + "\n";
	}
	textChannel.sendMessage(scoreboard);
}

function endOfTurn() {
	if (endOfGameConditions() == true)
		endOfGame();
	
	for (var i = 0; i < players.length; i++) {
		var oldCardIndex = players[i].hand.indexOf(players[i].submittedCard);
		players[i].hand[oldCardIndex] = drawCard();
		players[i].submittedCard = false;
		players[i].submittedVote = false;
		sendPlayerHand(i);
	}
	//increment storyteller
	playerCursor++;
	if (playerCursor >= players.length)
		playerCursor = 0;
	players[playerCursor].submittedVote = -1;
	
	nextTurn();
}

function endOfGameConditions() {
	var result = false;
	for (var i = 0; i < players.length; i++) {
		if (players[i].score >= 30)
			result = true;
	}
	if (DECK_SIZE - deckCursor < players.length)
		result = true;
	return result;
}

function endOfGame() {
	gameInProgress = false;
	textChannel.sendMessage("game complete.");
	updateScoreboard();
}

/*
	HANDLE INCOMING MESSAGES
*/
bot.on("message", function(message) {
	
	//filter out messages from those not in game
	if (gameInProgress == true) {
		var ids = [];
		for (var i = 0; i < players.length; i++) {
			ids[i] = players[i].id;
		}
		if (ids.includes(message.author.id) == false)
			return;
	}

	var msg = message.content.trim().toLowerCase();
	
	if (gameInProgress == false) {
		//check for valid source to start game
		if (message.member == null)
			return;	
		if (message.member.voiceChannelID === null || message.member.voiceChannelID === undefined)
			return;
		if (bot.channels.has(message.member.voiceChannelID) == false)
			return;
		
		if (msg == "play dixit") {
			
			var members_in = message.member.voiceChannel.members.array();
			var members_out = [];
			var index = 0;
			for (var i = 0; i < members_in.length; i++) {
				if (members_in[i].user.bot == false) {
					members_out[index] = members_in[i];
					index++;
				}				
			}

			if (members_out.length < 3 || members_out.length > 6) {
				message.reply("Number of players must be between 3 and 6.");
				return;
			}
			textChannel = message.channel;
			initializeGame(members_out);
		}
	}
	else if (awaitingStory == true) {
		if (message.author.id != players[playerCursor].id)
			return;
		story = msg;
		var requestMsg = players[playerCursor].name +
			"'s story is:\n" +
			"\"" + story + "\"\n\n" +
			"Please submit your card (enter number from hand).";
		textChannel.sendMessage(requestMsg);
		awaitingStory = false;
		awaitingCards = true;
	}
	else if (awaitingCards == true) {
		var card = parseInt(msg, 10);
		if (isNaN(card) == true) {
			
		}
		else if (card < 1 || card > 6) {
			
		}
		else {
			for (var i = 0; i < players.length; i++) {
				if (players[i].id == message.author.id) {
					players[i].submittedCard = players[i].hand[card-1];
				}
			}
			//check if all cards submitted
			if (players.every(
				function(element) { return !(element.submittedCard === false); }
				) == true)
			{
				sendSubmittedCards();
				var requestMsg = "Please cast your vote for this story.";
				textChannel.sendMessage(requestMsg);
				awaitingCards = false;
				awaitingVotes = true;
			}
		}
	}
	else if (awaitingVotes == true) {
		var vote = parseInt(msg, 10);
		if (isNaN(vote) == true) {
			
		}
		else if (vote < 1 || vote > players.length) {
			
		}
		else {
			//ensure players dont vote or their own card
			for (var i = 0; i < players.length; i++) {
				if (players[i].id == message.author.id && playersIndexedByVote[vote-1] == i) {
					return;
				}
			}

			for (var i = 0; i < players.length; i++) {
				if (players[i].id == message.author.id) {
					players[i].submittedVote = vote-1;
				}
			}
			//check if all votes submitted
			if (players.every(
				function(element) { 
					return !(element.submittedVote === false); 
				}
				) == true)
			{
				awaitingVotes = false;
				calculateAndShowResults();
				endOfTurn();
			}
		}
	}	
	
});


/*
	LOGIN INFO GOES HERE
*/
//bot.login("???????");

function shuffle(a) {
    for (let i = a.length; i; i--) {
        let j = Math.floor(Math.random() * i);
        [a[i - 1], a[j]] = [a[j], a[i - 1]];
    }
}