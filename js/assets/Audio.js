/* global MO5 */

MO5("WSE.tools").define("WSE.assets.Audio", function (tools) {
    
    "use strict";
    
    /**
     * Constructor for the <audio> asset.
     * 
     * @param asset [XML DOM Element] The asset definition.
     * @param interpreter [object] The interpreter instance.
     * @trigger wse.interpreter.warning@interpreter
     * @trigger wse.assets.audio.constructor@interpreter
     */
    function Audio (asset, interpreter)
    {
        var self, sources, i, len, j, jlen, current, track, trackName;
        var trackFiles, href, type, source, tracks, bus;

        bus = interpreter.bus;
        self = this;
        this.au = new window.Audio();
        this.au.setAttribute("preload", "auto");
        this.bus = bus;
        this.name = asset.getAttribute("name");
        this.tracks = {};
        this.current = null;
        this.currentIndex = null;
        this.currentIndexFinal = null;
        this.autopause = asset.getAttribute("autopause") === "true" ? true : false;
        this.loop = asset.getAttribute("loop") === "true" ? true : false;
        this.fade = asset.getAttribute("fade") === "true" ? true : false;
        this.fadeinDuration = parseInt(asset.getAttribute("fadein")) || 1000;
        this.fadeoutDuration = parseInt(asset.getAttribute("fadeout")) || 1000;
        this.id = tools.getUniqueId();
        this.isPlaying = false;
        this.isPlayingFinal = false;
        this.asyncQueue = [];
        this.asyncId = 0;
            
        tracks = asset.getElementsByTagName("track");
        len = tracks.length;
        
        if (len < 1)
        {
            this.bus.trigger(
                "wse.interpreter.warning",
                {
                    element: asset,
                    message: "No tracks defined for audio element '" + this.name + "'."
                }
            );
            
            return {
                doNext: true
            };
        }

        // check all sources and create <audio> elements:
        for (i = 0; i < len; i += 1)
        {
            current = tracks[i];

            trackName = current.getAttribute("title");
            if (trackName === null)
            {
                this.bus.trigger(
                    "wse.interpreter.warning",
                    {
                        element: asset,
                        message: "No title defined for track '" + trackName + "' in audio element '" + this.name + "'."
                    }
                );
                continue;
            }

            sources = current.getElementsByTagName("source");
            jlen = sources.length;
            if (jlen < 1)
            {
                this.bus.trigger(
                    "wse.interpreter.warning",
                    {
                        element: asset,
                        message: "No sources defined for track '" + trackName + "' in audio element '" + this.name + "'."
                    }
                );
                continue;
            }

            track = new window.Audio();
            track.setAttribute("preload", "auto");
            
            if (this.loop)
            {
                track.loop = true;
            }
            
            trackFiles = {};

            for (j = 0; j < jlen; j += 1)
            {
                source = sources[j];
                href = source.getAttribute("href");
                type = source.getAttribute("type");

                if (href === null)
                {
                    this.bus.trigger(
                        "wse.interpreter.warning",
                        {
                            element: asset,
                            message: "No href defined for source in track '" +
                                trackName + "' in audio element '" + 
                                this.name + "'."
                        }
                    );
                    continue;
                }

                if (type === null)
                {
                    this.bus.trigger(
                        "wse.interpreter.warning",
                        {
                            element: asset,
                            message: "No type defined for source in track '" + 
                                trackName + "' in audio element '" + 
                                this.name + "'."
                        }
                    );
                    continue;
                }

                trackFiles[type] = href;
            }

            // Progress bar doesn't work... because audio/video get streamed?
            /*
             * this.bus.trigger("wse.assets.loading.increase");
             * out.tools.attachEventListener(track, 'load', function() { self.bus.trigger("wse.assets.loading.decrease"); });*/

            if (
                track.canPlayType("audio/mpeg") &&
                typeof trackFiles.mp3 !== "undefined"
            )
            {
                track.src = trackFiles.mp3;
            }
            else
            {
                if (typeof trackFiles.ogg === "undefined")
                {
                    this.bus.trigger(
                        "wse.interpreter.warning",
                        {
                            element: asset,
                            message: "No usable source found for track '" + 
                                trackName + "' in audio element '" + 
                                this.name + "'."
                        }
                    );
                    continue;
                }
                track.src = trackFiles.ogg;
            }
            
            interpreter.stage.appendChild(track);

            this.tracks[trackName] = track;
        }

        // We need to reload the audio element because stupid Chrome is too dumb to loop.
        this.renewCurrent = function ()
        {
            var dupl, src;
            
            dupl = new window.Audio();
            dupl.setAttribute("preload", "auto");
            src = self.current.src;
            
            try
            {
                interpreter.stage.removeChild(self.current);
            }
            catch (e)
            {
                console.log(e);
            }
            
            dupl.src = src;
            self.current = dupl;
            self.tracks[self.currentIndex] = dupl;
            interpreter.stage.appendChild(dupl);
        };

        /**
         * Starts playing the current track.
         * 
         * @param command [XML DOM Element] The command as written in the WebStory.
         * @return [object] Object that determines the next state of the interpreter.
         */
        this.play = function (command)
        {
            command = command || document.createElement("div");
            var fade = command.getAttribute("fade") === "true" ? true : command.getAttribute("fade") === "false" ? false : this.fade;
            var fadeinDuration = fade ? (parseInt(command.getAttribute("fadein")) || this.fadeinDuration) : 0;

            if (self.isPlayingFinal === true)
            {
                self.stop(command);
            }

            self.asyncFadeOut(0); 

            self.asyncAttachListeners();
            self.asyncCall(
                    function()
                    {
                        self.current.play();
                        self.isPlaying = true;
                    }
                );
            self.asyncFadeIn(fadeinDuration);
            
            self.isPlayingFinal = true;

            this.bus.trigger("wse.assets.audio.play", this);

            return {
                doNext: true
            };
        };

        /**
         * Stops playing the current track.
         * 
         * @param command [XML DOM Element] The command as written in the WebStory.
         * @return [object] Object that determines the next state of the interpreter.
         */
        this.stop = function (command)
        {
            command = command || document.createElement("div");
            var fade = command.getAttribute("fade") === "true" ? true : command.getAttribute("fade") === "false" ? false : self.fade;
            var fadeoutDuration = fade ? (parseInt(command.getAttribute("fadeout")) || self.fadeoutDuration) : 0;

            self.asyncFadeOut(fadeoutDuration);
            self.asyncCall(
                    function ()
                    {
                        self.current.pause();
                        self.currentTime = 0.1;
                        self.renewCurrent();
                        self.isPlaying = false;
                    }
                );

            self.isPlayingFinal = false;
            
            this.bus.trigger("wse.assets.audio.stop", this);
            
            return {
                doNext: true
            };
        };

        /**
         * Pauses playing the curren track.
         * 
         * @return [object] Object that determines the next state of the interpreter.
         */
        this.pause = function ()
        {
            self.asyncCall( function (){ this.current.pause(); } );
            
            return {
                doNext: true
            };
        };

        this.asyncCall = function (cb, isDone)
        {
            var fn, asyncId = this.asyncId;

            this.asyncId += 1;
            this.asyncQueue.push(asyncId);
           
            fn = function ()
            {
                if ( self.asyncQueue.indexOf(asyncId) === -1 )
                {
                    return;
                }

                if ( self.asyncQueue[0] === asyncId )
                {
                    //console.log(cb);
                    cb();
                    if ( typeof isDone === "function" ? isDone() : true )
                    {
                        self.asyncQueue.shift();
                        return;
                    }
                }
                setTimeout(fn, 10);
            };
            
            setTimeout(fn, 10);
            
            return {
                doNext: true
            };
        };

        this.asyncAttachListeners = function ()
        {
            var fn = function ()
            {
                if (self.loop === true)
                {
                    tools.attachEventListener(
                        self.current, 
                        'ended', 
                        function ()
                        {
                            self.renewCurrent();
                            setTimeout(
                                function ()
                                {
                                    self.isPlaying = true;
                                    self.play();
                                }, 
                                0
                            );
                        }
                    );
                }
                else
                {
                    tools.attachEventListener(
                        self.current, 
                        'ended', 
                        function ()
                        {
                            self.isPlaying = false;
                            if ( self.asyncQueue.size === 0 )
                            {
                                self.isPlayingFinal = false;
                            }
                        }
                    );
                }
            };
            
            return this.asyncCall(fn);
        };


        this.asyncFadeIn = function (duration)
        {
            var fn = function ()
            {
                //console.log("fadeIn timer callback is called");
                if ( duration > 0 )
                {
                    var vol = self.current.volume + 1.0 * 10 / duration;
                    self.current.volume = vol < 1.0 ? vol : 1.0;
                }
                else
                {
                    self.current.volume = 1.0;
                }
            };
            var isDone = function(){return self.current.volume === 1.0;};
            return this.asyncCall(fn, isDone);
        };

        this.asyncFadeOut = function (duration)
        {
            var fn = function ()
            {
                //console.log("fadeOut timer callback is called");
                if ( duration > 0 )
                {
                    var vol = self.current.volume - 1.0 * 10 / duration;
                    self.current.volume = vol > 0.0 ? vol : 0.0;
                }
                else
                {
                    self.current.volume = 0.0;
                }
            };
            var isDone = function(){return self.current.volume === 0.0;};
            return this.asyncCall(fn, isDone);
        };

        if (this.autopause === false)
        {
            //console.log("autopause is false");
            return;
        }
        
        tools.attachEventListener(
            window, 
            'blur', 
            function ()
            {
                console.log("onblur function for audio called");
                if (self.isPlayingFinal === true)
                {
                    self.asyncFadeOut(500);
                    self.asyncCall( function (){ self.current.pause(); } );
                }
            }
        );
        
        tools.attachEventListener(
            window, 
            'focus', 
            function ()
            {
                console.log("onfocus function for audio called");
                if (self.isPlayingFinal === true)
                {
                    self.asyncCall( function (){ self.current.play(); } );
                    self.asyncFadeIn(500);
                }
            }
        );

        this.bus.trigger("wse.assets.audio.constructor", this);
    };

    /**
     * Changes the currently active track.
     * 
     * @param command [DOM Element] The command as specified in the WebStory.
     * @trigger wse.interpreter.warning@interpreter
     * @trigger wse.assets.audio.set@interpreter
     */
    Audio.prototype.set = function (command)
    {
        var name, wasPlaying, self;

        self = this;
        name = command.getAttribute("track");
        wasPlaying = this.isPlayingFinal;

        if (typeof this.tracks[name] === "undefined" || this.tracks[name] === null)
        {
            this.bus.trigger(
                "wse.interpreter.warning",
                {
                    element: command,
                    message: "Unknown track '" + name + "' in audio element '" + this.name + "'."
                }
            );
            
            return {
                doNext: true
            };
        }

        if (wasPlaying === true)
        {
            this.stop(command);
        }

        self.asyncCall(
                function ()
                {
                    self.isPlaying = false;
                    self.currentIndex = name;
                    self.current = self.tracks[name];
                }
            );
            
        self.currentIndexFinal = name;
        
        if (wasPlaying === true)
        {
            this.play(command);
        }

        this.bus.trigger("wse.assets.audio.set", this);
        
        return {
            doNext: true
        };
    };

    /**
     * Gathers the data to put into a savegame.
     * 
     * @param obj [object] The savegame object.
     */
    Audio.prototype.save = function ()
    {
        var obj = {
            assetType: "Audio",
            isPlaying: this.isPlayingFinal,
            fade: this.fade,
            fadeinDuration: this.fadeinDuration,
            fadeoutDuration: this.fadeoutDuration,
            currentIndex: this.currentIndexFinal,
            currentTime: 0
        };
        
        if (this.isPlaying)
        {
            obj.currentTime = this.current.currentTime;
        }
        
        this.bus.trigger("wse.assets.audio.save", this);
        
        return obj;
    };

    /**
     * Restore function for loading the state from a savegame.
     * 
     * @param obj [object] The savegame data.
     * @trigger wse.assets.audio.restore@interpreter
     */
    Audio.prototype.restore = function (vals)
    {
        this.isPlaying = vals.isPlaying;
        this.isPlayingFinal = vals.isPlaying;
        this.fade = vals.fade;
        this.fadeinDuration = vals.fadeinDuration;
        this.fadeoutDuration = vals.fadeoutDuration;
        this.currentIndex = vals.currentIndex;
        this.currentIndexFinal = vals.currentIndex;
        this.asyncQueue = [];
        this.asyncId = 0;
        
        if (this.tracks[this.currentIndex]) 
        {
            this.current = this.tracks[this.currentIndex];
            this.current.currentTime = vals.currentTime;
        }

        if (this.isPlaying)
        {
            this.fade = false;
            this.play();
            this.fade = vals.fade;
        }
        else
        {
            this.stop();
        }
        
        this.bus.trigger("wse.assets.audio.restore", this);
    };
    
    return Audio;
    
});