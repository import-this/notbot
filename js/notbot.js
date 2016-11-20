/**
 * notbot
 * https://import-this.github.io/notbot
 *
 * A fast-paced interactive puzzle game.
 *
 * Copyright (c) 2016, Vasilis Poulimenos
 * Released under the BSD 3-Clause License
 * https://github.com/import-this/notbot/blob/master/LICENSE
 *
 * Supported browsers (as suggested by online references):
 *     IE 9+, FF 3.5+, Chrome 4+, Opera 10.60+, SF 4+
 *
 * The code follows the conventions of Google JavaScript Style Guide,
 *     with some alterations. The style guide is described in depth here:
 *     https://google-styleguide.googlecode.com/svn/trunk/javascriptguide.xml
 * Comments follow the conventions of JSDoc. Documentation can be found here:
 *     http://usejsdoc.org/
 *
 * Date: 12/11/2016
 * @version: 1.0.0
 * @author Vasilis Poulimenos
 */

/*globals jQuery */
(function($, window) {

"use strict";

/******************************* Basic Logging ********************************/

/** @const */
var log = (function() {
    var console = window.console;

    if (console && console.log) {
        // Don't simply return console.log, because that messes up 'this'.
        return function log(msg) {console.log(msg); };
    }
    return function noop() {};
}());

/*********************************** notbot ***********************************/

/**
 * Don't forget to set this to false in production!
 * @const
 */
var DEBUG = !true;

/**
 * The notbot namespace.
 */
var notbot = {};

/******************************* Local Storage ********************************/

// https://developer.mozilla.org/en-US/docs/Web/Guide/API/DOM/Storage
// http://dev.w3.org/html5/webstorage/

/**
 * Local storage is per origin (per domain and protocol),
 * so use a prefix to avoid collisions with other games.
 * @const {string}
 */
var PREFIX = 'notbot_',
/** @const {string} */
    BUMP_WALLS_KEY = PREFIX + 'bump_off_walls',
/** @const {string} */
    BUMP_BOTS_KEY = PREFIX + 'bump_off_bots',
/** @const {string} */
    BOT_COUNT_KEY = PREFIX + 'bot_count',
/** @const {string} */
    BEST_TIME_KEY = PREFIX + 'best_time',
/** @const {string} */
    BEST_MOVE_COUNT_KEY = PREFIX + 'best_move_count';


function save(key, value) {
    window.localStorage.setItem(key, value);
}

function load(key) {
    return window.localStorage.getItem(key);
}

function loadBest(key) {
    var best = load(key);

    return (best === null) ? null : Number(best);
}

function saveBest(key, value) {
    var best = loadBest(key);

    if (best === null || value < best) {
        save(key, value);
    }
}


function saveBestTime(time) {
    saveBest(BEST_TIME_KEY, time);
}
function loadBestTime() {
    return loadBest(BEST_TIME_KEY);
}
function saveBestMoveCount(count) {
    saveBest(BEST_MOVE_COUNT_KEY, count);
}
function loadBestMoveCount() {
    return loadBest(BEST_MOVE_COUNT_KEY);
}


notbot.saveOptions = function saveOptions() {
    save(BUMP_WALLS_KEY, $('#bump-walls').prop('checked'));
    save(BUMP_BOTS_KEY, $('#bump-bots').prop('checked'));

    save(BOT_COUNT_KEY, $('#options input[name="bot-count"]:checked').attr('id'));
};

notbot.loadOptions = function loadOptions() {
    $('#bump-walls').prop('checked', load(BUMP_WALLS_KEY) === 'true');
    $('#bump-bots').prop('checked', load(BUMP_BOTS_KEY) === 'true');

    $('#options input[name="bot-count"]').filter('#' + load(BOT_COUNT_KEY))
        .prop('checked', true);
};


function pad(str) {
    str = String(str);
    return ('00' + str).substring(str.length);
}

function formatTime(elapsedTimeSecs) {
    return pad(Math.floor(elapsedTimeSecs / 60)) + ':' + pad(elapsedTimeSecs % 60);
}


function getCellSelector(i, j) {
    return '#p-' + i + '-' + j;
}

function getPostSelector(i) {
    return '#post' + i;
}

function getBotSelector(i) {
    return '#bot' + i;
}

function getBotNumber($element) {
    // Only works for single digits!
    return parseInt($element.attr('id').slice(-1), 10);
}


/**
 *
 * @param {number} size - the size of the grid
 * @param {number} count - the number of bots on the grid
 * @param {object} opts -
 */
function BotGrid(size, count, opts) {
    var i, j, tempArr;

    this.size = size;
    this.count = count;
    this.opts = opts;

    tempArr = [];
    for (i = 0; i < size; ++i) {
        for (j = 0; j < size; ++j) {
            tempArr.push([i, j]);
        }
    }
    BotGrid.shuffle(tempArr);

    // The current positions of the bots.
    this._bots = tempArr.splice(0, count);
    // The final posts that the bots should reach.
    // posts[i] -> post for bot[i]
    this._posts = tempArr.splice(0, count);

    // The direction of each bot.
    this._directions = [];
    for (i = 0; i < count; ++i) {
        this._directions.push(Math.floor(Math.random() * 4));
    }

    // Place the posts and bots in their corresponding positions.
    this._posts.forEach(function placePost(post, i) {
        $(getPostSelector(i))
            .offset($(getCellSelector(post[0], post[1])).offset());
    }, this);
    this._bots.forEach(function placeBot(bot, i) {
        $(getBotSelector(i))
            .offset($(getCellSelector(bot[0], bot[1])).offset())
            .children('.arrow').css(
                'transform', 'rotate(' + ((this._directions[i] - 1) * 90) + 'deg)');
    }, this);

    if (DEBUG) {
        log(this._bots);
        log(this._posts);
        log(this._directions);
    }
}

/**
 * An enumeration of the possible directions for a bot.
 * The directions go clockwise!
 */
BotGrid.Directions = {
    UP: 0,
    RIGHT: 1,
    DOWN: 2,
    LEFT: 3
};
if (Object.freeze) {
    Object.freeze(BotGrid.Directions);
}

BotGrid.shuffle = function shuffle(array) {
    var i, j, temp;

    for (i = array.length - 1; i > 0; --i) {
        j = Math.floor(Math.random() * (i + 1));

        temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
};

/**
 * Compares two arrays of arrays of numbers for equality.
 * The arrays are assumed to be of the same length.
 *
 * @param {Array.<number>} first - the first array
 * @param {Array.<number>} second - the second array
 * @return {boolean} - true, if the arrays are the same.
 */
BotGrid._arrayEquals = function(first, second) {
    var len = first.length, len2, i, j;

    for (i = 0; i < len; ++i) {
        len2 = first[i].length;
        for (j = 0; j < len2; ++j) {
            if (first[i][j] !== second[i][j])
                return false;
        }
    }
    return true;
};

/**
 * Tells if the cell at the position specified is occupied.
 *
 * @param {number} i - the i-coord
 * @param {number} j - the j-coord
 * @return {boolean} - true, if the cell is currently occupied
 */
BotGrid.prototype._isOccupied = function(i, j) {
    return this._bots.some(function(cell, index) {
        return cell[0] === i && cell[1] === j;
    });
};


BotGrid.prototype.rotateBotClockwise = function(index) {
    var $elem = $(getBotSelector(index)).children('.arrow'),
        oldDirection = this._directions[index];

    this._directions[index] = (oldDirection + 1) % 4;

    // http://stackoverflow.com/a/15191130/1751037
    // We use a pseudo object for the animation.
    // Note that we use the 'right arrow', so the angle needs a fix.
    $({deg: (oldDirection - 1) * 90}).animate({
        deg: (this._directions[index] - 1) * 90
    }, {
        duration: 75,
        step: function stepRotation(now) {
            $elem.css('transform', 'rotate(' + now + 'deg)');
        }
    });
};


var vec = [0, 0];

BotGrid.prototype._move = function(bot, index, axis, direction, limit) {
    vec[0] = bot[0];
    vec[1] = bot[1];
    vec[axis] += direction;

    if (bot[axis] === limit) {
        // Edge of grid.
        if (this.opts.bumpOffWalls) {
            this.rotateBotClockwise(index);
        }
    } else if (!this._isOccupied(vec[0], vec[1])) {
        // Empty spot.
        bot[axis] += direction;
    } else {
        // Bot in front.
        if (this.opts.bumpOffBots) {
            this.rotateBotClockwise(index);
        }
    }
};

BotGrid.prototype._advanceBot = function(bot, index) {
    switch (this._directions[index]) {
        case BotGrid.Directions.UP:
            this._move(bot, index, 0, -1, 0);
            break;
        case BotGrid.Directions.DOWN:
            this._move(bot, index, 0, 1, this.size -1);
            break;
        case BotGrid.Directions.LEFT:
            this._move(bot, index, 1, -1, 0);
            break;
        case BotGrid.Directions.RIGHT:
            this._move(bot, index, 1, 1, this.size - 1);
            break;
        default:
            throw new Error('Invalid bot direction!');
    }

    // .position(), not .offset()
    $(getBotSelector(index)).animate(
        $(getCellSelector(bot[0], bot[1])).position(), 500, 'linear');
};

BotGrid.prototype.advanceBots = function() {
    this._bots.forEach(this._advanceBot, this);
    if (DEBUG) {
        log(this._bots);
        log(this._directions);
    }
};

/**
 * Tells if the player has won.
 * @return {boolean} - true, if the player won
 */
BotGrid.prototype.win = function() {
    return BotGrid._arrayEquals(this._bots, this._posts);
};


// Interval IDs.
var timerId, updateId;

notbot.start = function() {
    var best, botCount, grid, elapsedTime, moveCount;

    best = loadBestTime();
    if (best !== null) {
        $('#best-time span').text(formatTime(best));
    }
    best = loadBestMoveCount();
    if (best !== null) {
        $('#best-move-count span').text(best);
    }

    elapsedTime = 0;
    moveCount = 0;

    // Generate a new grid.
    botCount = parseInt($('#options input[name="bot-count"]:checked').val(), 10);
    grid = new BotGrid(5, botCount, {
        bumpOffWalls: $('#bump-walls').is(':checked'),
        bumpOffBots: $('#bump-bots').is(':checked')
    });

    // Reset timer and move count.
    if (timerId) {
        clearInterval(timerId);
        $('#time span').text('00:00');
        $('#move-count span').text('0');

        clearInterval(updateId);
    }
    // Start timer.
    timerId = setInterval(function updateTimer() {
        ++elapsedTime;
        $('#time span').text(formatTime(elapsedTime));
    }, 1000);
    // Start update loop.
    updateId = setInterval(function advanceBots() {
        grid.advanceBots();
        if (grid.win()) {
            // Stop the timer and the update loop.
            clearInterval(timerId);
            clearInterval(updateId);
            // Note the delay used, so as to allow the bot to reach its spot.
            $('#win-screen').delay(500).fadeIn(750, 'linear');
            // Update best time and move count, if necessary.
            saveBestTime(elapsedTime);
            $('#best-time span').text(formatTime(loadBestTime()));
            saveBestMoveCount(moveCount);
            $('#best-move-count span').text(loadBestMoveCount());
        }
    }, 1500);

    // The winning screen may have been left showing.
    $('#win-screen').hide();
    // Clear all animations left.
    $('.bot').stop(true);

    $('#bot-container')
        // Remove any previous handlers.
        .off()
        .on('click', '.bot', function onClick(event) {
            grid.rotateBotClockwise(getBotNumber($(this)));
            $('#move-count span').text(++moveCount);
            return false;
        })
        // Prevent text selection on successive clicks.
        .on('mousedown', '.bot', function onMousedown(event) {
            event.preventDefault();
        });
};

// Expose;
window.notbot = notbot;

}(jQuery, window));
