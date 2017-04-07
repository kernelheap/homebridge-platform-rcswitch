var Service, Characteristic, LastUpdate;
var rsswitch = require("./build/Release/rsswitch");

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

    setTimeout(self.listen.bind(self),10);
    callback(self.accessories);
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
    if(this.sw.on.code === code) {
        self.log("%s is turned on", self.sw.name);
        self.service.getCharacteristic(Characteristic.On).setValue(true);
    } else if (this.sw.off.code === code) {
        self.log("%s is turned off", self.sw.name);
        self.service.getCharacteristic(Characteristic.On).setValue(false);
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

function RCContactAccessory(sw, log, config) {
    var self = this;
    self.name = sw.name;
    self.sw = sw;
    self.log = log;
    self.config = config;
    self.currentState = false;
    self.Timer;

    self.service = new Service.ContactSensor(self.name);
}
RCContactAccessory.prototype.notify = function(code) {
    var self = this;
    if(this.sw.on.code === code) {
        self.log("%s is turned on", self.sw.name);
        self.service.getCharacteristic(Characteristic.ContactSensorState).setValue(true);
	clearTimeout(self.Timer);
	self.Timer = setTimeout(function() {
			self.service.getCharacteristic(Characteristic.ContactSensorState).setValue(false);
			}.bind(self), 5000);
    } else if (this.sw.off.code === code) {
        self.log("%s is turned off", self.sw.name);
	clearTimeout(self.Timer);
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
	self.log("Setting switch to " + on);

	if (on) {
          rsswitch.send(self.config.send_pin, self.sw.code, self.sw.pulse);
		if (self.sw.timeout != null) {
		setTimeout(function() {
		    self.service.setCharacteristic(Characteristic.On, false);
		}.bind(self), self.sw.timeout);
		}
	} else if (self.sw.timeout == null) {
          rsswitch.send(self.config.send_pin, self.sw.code, self.sw.pulse);
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
