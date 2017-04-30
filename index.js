var Service, Characteristic, LastUpdate;
var rsswitch = require("./build/Release/rsswitch");
var request = require("request");

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerPlatform("homebridge-platform-rcswitch", "RCSwitch", RCSwitchPlatform);
}

function RCSwitchPlatform(log, config) {
    var self = this;
    self.config = config;
    self.log = log;
    rsswitch.setupSniffer(self.config.sniffer_pin, self.config.tolerance);
}
RCSwitchPlatform.prototype.listen = function() {
    var self = this;
    rsswitch.sniffer(function(value, delay) {
        self.log('got a message, value=[%d], delay=[%d]', value, delay);
        if(self.accessories) {
            self.accessories.forEach(function(accessory) {
                accessory.notify.call(accessory, value);
            });
        }
        setTimeout(self.listen.bind(self), 0);
    });
}
RCSwitchPlatform.prototype.accessories = function(callback) {
    var self = this;
    self.accessories = [];
    self.config.switches.forEach(function(sw) {
        self.accessories.push(new RCSwitchAccessory(sw, self.log, self.config));
    });
    self.config.contact.forEach(function(sw) {
	self.accessories.push(new RCContactAccessory(sw, self.log, self.config));
    });
    self.config.toggle.forEach(function(sw) {
    	self.accessories.push(new RCToggleAccessory(sw, self.log, self.config));
    });
    self.config.motion.forEach(function(sw) {
    	self.accessories.push(new RCMotionAccessory(sw, self.log, self.config));
    });
    self.config.garage.forEach(function(sw) {
    	self.accessories.push(new RCGarageAccessory(sw, self.log, self.config));
    });

    setTimeout(self.listen.bind(self),10);
    callback(self.accessories);
}

function iftttTrigger(obj, key, trigger) {
	if (key != null && trigger != null) {
		var url = "https://maker.ifttt.com/trigger/"+trigger+"/with/key/"+key;
		var method = "get";
		request({ url: url, method: method }, function(err, response) {
			if (err) {
				obj.log("There was a problem sending command " + url);
			} else {
				obj.log(" Sent command " + url);
			}
		});
	}
}

function RCSwitchAccessory(sw, log, config) {
    var self = this;
    self.name = sw.name;
    self.sw = sw;
    self.log = log;
    self.config = config;
    self.currentState = false;

    self.service = new Service.Switch(self.name);

    self.service.getCharacteristic(Characteristic.On).value = self.currentState;
    
    self.service.getCharacteristic(Characteristic.On).on('get', function(cb) {
        cb(null, self.currentState);
    }.bind(self));

    self.service.getCharacteristic(Characteristic.On).on('set', function(state, cb) {
        self.currentState = state;
        if(self.currentState) {
          rsswitch.send(self.config.send_pin, self.sw.on.code, self.sw.on.pulse);
        } else {
          rsswitch.send(self.config.send_pin, self.sw.off.code, self.sw.off.pulse);
        }
        cb(null);
    }.bind(self));
}

RCSwitchAccessory.prototype.notify = function(code) {
    var self = this;
    var key = self.config.makerkey;
    if(this.sw.on.code === code) {
	var trigger = self.sw.on.trigger;
        self.log("%s is turned on", self.sw.name);
        self.service.getCharacteristic(Characteristic.On).setValue(true);
	iftttTrigger(self, key, trigger);
    } else if (this.sw.off.code === code) {
	var trigger = self.sw.off.trigger;
        self.log("%s is turned off", self.sw.name);
        self.service.getCharacteristic(Characteristic.On).setValue(false);
	iftttTrigger(self, key, trigger);
    }
}
RCSwitchAccessory.prototype.getServices = function() {
    var self = this;
    var services = [];
    var service = new Service.AccessoryInformation();
    service.setCharacteristic(Characteristic.Name, self.name)
        .setCharacteristic(Characteristic.Manufacturer, 'Raspberry Pi')
        .setCharacteristic(Characteristic.Model, 'Raspberry Pi')
        .setCharacteristic(Characteristic.SerialNumber, 'Raspberry Pi')
        .setCharacteristic(Characteristic.FirmwareRevision, '1.0.0')
        .setCharacteristic(Characteristic.HardwareRevision, '1.0.0');
    services.push(service);
    services.push(self.service);
    return services;
}

function RCGarageAccessory(sw, log, config) {
    var self = this;
    self.name = sw.name;
    self.sw = sw;
    self.log = log;
    self.config = config;
    self.openTimer;
    self.closeBatchTimer;

    self.service = new Service.GarageDoorOpener(self.name);
    self.service.setCharacteristic(Characteristic.TargetDoorState,
		    Characteristic.TargetDoorState.CLOSED);
    self.service.setCharacteristic(Characteristic.CurrentDoorState,
		    Characteristic.CurrentDoorState.CLOSED);
    self.service.setCharacteristic(Characteristic.ObstructionDetected, false);

    self.service.getCharacteristic(Characteristic.TargetDoorState)
	    .on('get', (callback) => {
		  callback(null, self.service.getCharacteristic(
			Characteristic.TargetDoorState).value);
	    })
    	    .on('set', (value, callback) => {
		    var state = self.service.getCharacteristic(
				    Characteristic.CurrentDoorState).value;
		    if (state != Characteristic.CurrentDoorState.OPENING &&
				value === Characteristic.TargetDoorState.OPEN) {
		  	self.log('Garage: 3');
		    	rsswitch.send(self.config.send_pin, self.sw.clickCode,
					self.sw.pulse);
		    } else if (state != Characteristic.CurrentDoorState.CLOSING
			  && value === Characteristic.TargetDoorState.CLOSED) {
		  	self.log('Garage: 4');
		    	rsswitch.send(self.config.send_pin, self.sw.clickCode,
					self.sw.pulse);
			//self.service.setCharacteristic(
			//	Characteristic.CurrentDoorState,
			//	Characteristic.CurrentDoorState.CLOSING);
		    }
		    callback();
	    });
}

RCGarageAccessory.prototype.notify = function(code) {
    var self = this;
    var key = self.config.makerkey;
    if(this.sw.openCode === code) {
	clearTimeout(self.openTimer);
	self.log("%s is opening", self.sw.name);
	self.service.setCharacteristic(Characteristic.CurrentDoorState,
			Characteristic.CurrentDoorState.OPENING);
        self.service.getCharacteristic(Characteristic.TargetDoorState).
		setValue(Characteristic.TargetDoorState.OPEN);
	self.openTimer = setTimeout(function() {
 		self.log("%s is opened", self.sw.name);
		self.service.setCharacteristic(Characteristic.CurrentDoorState,
				Characteristic.CurrentDoorState.OPEN);
		iftttTrigger(self, self.config.makerkey, self.sw.openTrigger);
		self.openTimer = null;
	}.bind(self), self.sw.openingTime * 1000);
    } else if (this.sw.closeCode === code) {
	clearTimeout(self.closeBatchTimer);
	self.closeBatchTimer = setTimeout(function() {
 		self.log("%s is closed", self.sw.name);
		self.service.setCharacteristic(Characteristic.CurrentDoorState,
				Characteristic.CurrentDoorState.CLOSING);
		self.service.getCharacteristic(Characteristic.TargetDoorState).
			setValue(Characteristic.TargetDoorState.CLOSED);
		setTimeout(function() {
		 self.service.setCharacteristic(Characteristic.CurrentDoorState,
				Characteristic.CurrentDoorState.CLOSED);
		 iftttTrigger(self, self.config.makerkey, self.sw.closeTrigger);
		}.bind(self), 1000);

		self.closeBatchTimer = null;
	}.bind(self), 1000);
    } 
}

RCGarageAccessory.prototype.getServices = function() {
    var self = this;
    var services = [];
    var service = new Service.AccessoryInformation();
    service.setCharacteristic(Characteristic.Name, self.name)
        .setCharacteristic(Characteristic.Manufacturer, 'Raspberry Pi')
        .setCharacteristic(Characteristic.Model, 'Raspberry Pi')
        .setCharacteristic(Characteristic.SerialNumber, 'Raspberry Pi')
        .setCharacteristic(Characteristic.FirmwareRevision, '1.0.0')
        .setCharacteristic(Characteristic.HardwareRevision, '1.0.0');
    services.push(service);
    services.push(self.service);
    return services;
}



function RCContactAccessory(sw, log, config) {
    var self = this;
    self.name = sw.name;
    self.sw = sw;
    self.log = log;
    self.config = config;
    self.currentState = false;
    self.onTimer = null;
    self.offTimer = null;
    self.autooffTimer = null;

    self.service = new Service.ContactSensor(self.name);
    self.service.getCharacteristic(Characteristic.ContactSensorState).value = self.currentState;
    self.service.getCharacteristic(Characteristic.ContactSensorState).on('get', function(cb) {
        cb(null, self.currentState);
    }.bind(self));

    self.service.getCharacteristic(Characteristic.ContactSensorState).on('set', function(state, cb) {
        self.currentState = state;
        cb(null);
    }.bind(self));
}

RCContactAccessory.prototype.notify = function(code) {
    var self = this;
    var onTimeout;
    var offTimeout;
    var autoofftimeout;
    if (self.sw.on.code === code) {
	    if (self.sw.on.timeout != null) {
		    onTimeout = self.sw.on.timeout;
	    } else {
		    onTimeout = 1000;
	    }
	    if (self.onTimer != null)
		    clearTimeout(self.onTimer);
	    self.onTimer = setTimeout(function() {
		    self.log("%s Turned On", self.sw.name);
		    self.service.getCharacteristic(Characteristic.ContactSensorState).setValue(true);
		    iftttTrigger(self, self.config.makerkey, self.sw.on.trigger);
		    self.onTimer = null;
	    }.bind(self), onTimeout);

	    if (self.sw.off.autotimeout != null) {
		    autooffTimeout = self.sw.off.autotimeout;
		    if (self.autooffTimer != null)
			    clearTimeout(self.autooffTimer);
		    self.autooffTimer = setTimeout(function() {
			    self.log("%s Turned Off", self.sw.name);
			    self.service.getCharacteristic(Characteristic.ContactSensorState).setValue(false);
			    iftttTrigger(self, self.config.makerkey, self.sw.off.trigger);
			    self.autooffTimer = null;
		    }.bind(self), autooffTimeout);
	    }
    } else if (self.sw.off.code === code) {
	    if (self.sw.off.timeout != null) {
		    offTimeout = self.sw.off.timeout;
	    } else {
		    offTimeout = 1000;
	    }
	    if (self.offTimer != null)
		    clearTimeout(self.offTimer);
	    self.offTimer = setTimeout(function() {
		    self.log("%s Turned Off", self.sw.name);
		    self.service.getCharacteristic(Characteristic.ContactSensorState).setValue(false);
		    iftttTrigger(self, self.config.makerkey, self.sw.off.trigger);
		    self.offTimer = null;
	    }.bind(self), offTimeout);
    }
}

RCContactAccessory.prototype.getServices = function() {
    var self = this;
    var services = [];
    var service = new Service.AccessoryInformation();
    service.setCharacteristic(Characteristic.Name, self.name)
        .setCharacteristic(Characteristic.Manufacturer, 'Raspberry Pi')
        .setCharacteristic(Characteristic.Model, 'Raspberry Pi')
        .setCharacteristic(Characteristic.SerialNumber, 'Raspberry Pi')
        .setCharacteristic(Characteristic.FirmwareRevision, '1.0.0')
        .setCharacteristic(Characteristic.HardwareRevision, '1.0.0');
    services.push(service);
    services.push(self.service);
    return services;
}

function RCToggleAccessory(sw, log, config) {
    var self = this;
    self.name = sw.name;
    self.sw = sw;
    self.log = log;
    self.config = config;
    self.currentState = false;
    self.Timer;

    self.service = new Service.Switch(self.name);
    self.service.getCharacteristic(Characteristic.On)
	    .on('set', self._setOn.bind(self));
}

RCToggleAccessory.prototype._setOn = function(on, callback) {

	var self = this;
	var currentState = self.service.getCharacteristic(Characteristic.On).value;
	self.log("Setting switch to " + on);

	if (self.sw.timeout == null) {
		if (on == true && currentState == false) {
			rsswitch.send(self.config.send_pin, self.sw.code,
					self.sw.pulse);
			iftttTrigger(self, self.config.makerkey,
					self.sw.onTrigger);
		} else if (on == false && currentState == true) {
			rsswitch.send(self.config.send_pin, self.sw.code,
					self.sw.pulse);
			iftttTrigger(self, self.config.makerkey,
					self.sw.offTrigger);
		}
	} else {
		if (on) {
			rsswitch.send(self.config.send_pin, self.sw.code, self.sw.pulse);
			iftttTrigger(self, self.config.makerkey, self.sw.onTrigger);

			self.Timer = setTimeout(function() {
					self.log("%s Turned Off", self.sw.name);
					self.service.getCharacteristic(Characteristic.On).setValue(false);
					iftttTrigger(self, self.config.makerkey,
							self.sw.offTrigger);
					self.Timer = null;
			}.bind(self), self.sw.timeout);
		} else {
			clearTimeout(self.Timer);
		}
	}
	callback();
}

RCToggleAccessory.prototype.notify = function(code) {
}

RCToggleAccessory.prototype.getServices = function() {
    var self = this;
    var services = [];
    var service = new Service.AccessoryInformation();
    service.setCharacteristic(Characteristic.Name, self.name)
        .setCharacteristic(Characteristic.Manufacturer, 'Raspberry Pi')
        .setCharacteristic(Characteristic.Model, 'Raspberry Pi')
        .setCharacteristic(Characteristic.SerialNumber, 'Raspberry Pi')
        .setCharacteristic(Characteristic.FirmwareRevision, '1.0.0')
        .setCharacteristic(Characteristic.HardwareRevision, '1.0.0');
    services.push(service);
    services.push(self.service);
    return services;
}

function RCMotionAccessory(sw, log, config) {
    var self = this;
    self.name = sw.name;
    self.sw = sw;
    self.log = log;
    self.config = config;
    self.currentState = false;
    self.onTimer = null;
    self.offTimer = null;

    self.service = new Service.MotionSensor(self.name);
    self.service.getCharacteristic(Characteristic.MotionDetected).value = self.currentState;
    self.service.getCharacteristic(Characteristic.StatusActive).value = true;

    self.service.getCharacteristic(Characteristic.MotionDetected).on('get', function(cb) {
        cb(null, self.currentState);
    }.bind(self));

    self.service.getCharacteristic(Characteristic.MotionDetected).on('set', function(state, cb) {
        self.currentState = state;
        cb(null);
    }.bind(self));
}

RCMotionAccessory.prototype.notify = function(code) {
    var self = this;
    var onTimeout;
    var offTimeout;
    if (self.sw.code === code) {
	    if (self.sw.onTimeout != null) {
		    onTimeout = self.sw.onTimeout;
	    } else {
		    onTimeout = 3000;
	    }
	    if (self.onTimer != null)
		    clearTimeout(self.onTimer);
	    self.onTimer = setTimeout(function() {
		    var prevState = self.service.getCharacteristic(Characteristic.MotionDetected).value;
		    self.log("%s Turned On", self.sw.name);
		    self.service.getCharacteristic(Characteristic.MotionDetected).setValue(true);
		    if (prevState == false)
		    	iftttTrigger(self, self.config.makerkey, self.sw.onTrigger);
		    self.onTimer = null;	
	    }.bind(self), onTimeout);

	    if (self.sw.offTimeout != null) {
		    offTimeout = self.sw.offTimeout;
	    } else {
		    offTimeout = 360000;
	    }
	    if (self.offTimer != null)
		    clearTimeout(self.offTimer);
	    self.offTimer = setTimeout(function() {
		    self.log("%s Turned Off", self.sw.name);
		    self.service.getCharacteristic(Characteristic.MotionDetected).setValue(false);
		    iftttTrigger(self, self.config.makerkey, self.sw.offTrigger);
		    self.offTimer = null;
	    }.bind(self), offTimeout);
    }
}

RCMotionAccessory.prototype.getServices = function() {
    var self = this;
    var services = [];
    var service = new Service.AccessoryInformation();
    service.setCharacteristic(Characteristic.Name, self.name)
        .setCharacteristic(Characteristic.Manufacturer, 'Raspberry Pi')
        .setCharacteristic(Characteristic.Model, 'Raspberry Pi')
        .setCharacteristic(Characteristic.SerialNumber, 'Raspberry Pi')
        .setCharacteristic(Characteristic.FirmwareRevision, '1.0.0')
        .setCharacteristic(Characteristic.HardwareRevision, '1.0.0');
    services.push(service);
    services.push(self.service);
    return services;
}
