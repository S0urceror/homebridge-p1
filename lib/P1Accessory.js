// homebridge-p1/lib/P1Accessory.js
// Copyright © 2018-2019 Erik Baauw. All rights reserved.
//
// Homebridge plugin for DSMR end-consumer (P1) interface.

'use strict'

const fakegatoHistory = require('fakegato-history')
const moment = require('moment')

module.exports = {
  setHomebridge: setHomebridge,
  P1Accessory: P1Accessory
}

// ===== Homebridge ============================================================

let Service
let Characteristic
let eve
let my
let HistoryService

function setHomebridge (homebridge, _my, _eve) {
  Service = homebridge.hap.Service
  Characteristic = homebridge.hap.Characteristic
  eve = _eve
  my = _my
  HistoryService = fakegatoHistory(homebridge)
}

// ===== P1Accessory =============================================================

function P1Accessory (platform, name, data) {
  this.log = platform.log
  this.platform = platform
  this.type = name[0]
  this.name = name
  this.uuid_base = data.id
  this.infoService = new Service.AccessoryInformation()
  this.infoService
    .updateCharacteristic(Characteristic.Manufacturer, 'homebridge-p1')
    .updateCharacteristic(Characteristic.Model, 'homebridge-p1')
    .updateCharacteristic(Characteristic.SerialNumber, data.id)
    .updateCharacteristic(
      Characteristic.FirmwareRevision, this.platform.packageJson.version
    )

  this.service = new my.Service.Resource(this.name)
  this.service.addCharacteristic(eve.Characteristic.TotalConsumption)
  this.service.addCharacteristic(my.Characteristic.LastUpdated)
  if (this.type === 'E') {
    this.unit = 'kWh'
    this.service.addCharacteristic(my.Characteristic.TotalConsumptionNormal)
    this.service.addCharacteristic(my.Characteristic.TotalConsumptionLow)
  } else if (this.type === 'G') {
    this.unit = 'm³'
    this.service.getCharacteristic(eve.Characteristic.TotalConsumption)
      .setProps({ unit: this.unit })
  }
  if (data.tariff != null) {
    this.service.addCharacteristic(my.Characteristic.Tariff)
  }
  if (data.power != null) {
    this.service.addCharacteristic(eve.Characteristic.CurrentConsumption)
  }
  if (data.l1 != null && data.l1.current != null) {
    this.service.addCharacteristic(eve.Characteristic.ElectricCurrent)
  }
  if (data.l2 != null && data.l2.current != null) {
    this.service.addCharacteristic(eve.Characteristic.ElectricCurrent)
  }
  if (data.l3 != null && data.l3.current != null) {
    this.service.addCharacteristic(eve.Characteristic.ElectricCurrent)
  }
  if (data.l1 != null && data.l1.voltage != null) {
    this.service.addCharacteristic(eve.Characteristic.Voltage)
  }
  if (data.l2 != null && data.l2.voltage != null) {
    this.service.addCharacteristic(eve.Characteristic.Voltage)
  }
  if (data.l3 != null && data.l3.voltage != null) {
    this.service.addCharacteristic(eve.Characteristic.Voltage)
  }
  this.historyService = new HistoryService('energy', { displayName: this.name }, {
    disableTimer: true,
    storage: 'fs',
    path: this.platform.api.user.storagePath() + '/accessories',
    filename: 'history_' + data.id + '.json'
  })
  this.state = {
    history: {}
  }
  this.check(data)
  this.addEntry()
}

P1Accessory.prototype.getServices = function () {
  return [this.infoService, this.service, this.historyService]
}

P1Accessory.prototype.addEntry = function () {
  if (this.state.history.consumption != null) {
    const delta = Math.round(
      1000.0 * (this.state.consumption - this.state.history.consumption)
    )
    const entry = { time: moment().unix(), power: delta * 6.0 }
    this.log('%s: add history entry %j', this.name, entry)
    this.historyService.addEntry(entry)
  }
  this.state.history.consumption = this.state.consumption
}

P1Accessory.prototype.check = function (data) {
  const consumption = this.type === 'E'
    ? Math.round(1000 * (data.consumption.low + data.consumption.normal)) / 1000
    : data.consumption
  if (consumption != null && consumption !== this.state.consumption) {
    if (this.state.consumption != null) {
      this.log.info(
        '%s: set homekit total consumption from %s %s to %s %s', this.name,
        this.state.consumption, this.unit, consumption, this.unit
      )
    }
    this.state.consumption = consumption
    this.service.updateCharacteristic(
      eve.Characteristic.TotalConsumption, this.state.consumption
    )
  }
  if (this.type === 'E') {
    if (data.consumption.normal !== this.state.consumptionNormal) {
      if (this.state.consumptionNormal != null) {
        this.log.info(
          '%s: set homekit total consumption normal from %s kWh to %s kWh',
          this.name, this.state.consumptionNormal, data.consumption.normal
        )
      }
      this.state.consumptionNormal = data.consumption.normal
      this.service.updateCharacteristic(
        eve.Characteristic.TotalConsumptionNormal, this.state.consumptionNormal
      )
    }
    if (data.consumption.low !== this.state.consumptionLow) {
      if (this.state.consumptionLow != null) {
        this.log.info(
          '%s: set homekit total consumption low from %s kWh to %s kWh',
          this.name, this.state.consumptionLow, data.consumption.low
        )
      }
      this.state.consumptionLow = data.consumption.low
      this.service.updateCharacteristic(
        eve.Characteristic.TotalConsumptionLow, this.state.consumptionLow
      )
    }
  }
  const date = data.lastupdated == null ? new Date() : new Date(data.lastupdated)
  const lastupdated = String(date).substring(0, 24)
  if (lastupdated != null && lastupdated !== this.state.lastupdated) {
    this.state.lastupdated = lastupdated
    this.service.updateCharacteristic(
      my.Characteristic.LastUpdated, this.state.lastupdated
    )
  }
  if (data.power != null && data.power !== this.state.power) {
    if (this.state.power != null) {
      this.log.info(
        '%s: set homekit current consumption from %s W to %s W', this.name,
        this.state.power, data.power
      )
    }
    this.state.power = data.power
    this.service.updateCharacteristic(
      eve.Characteristic.CurrentConsumption, this.state.power
    )
  }
  if (data.tariff != null && data.tariff !== this.state.tariff) {
    if (this.state.tariff != null) {
      this.log.info(
        '%s: set homekit tariff from %s to %s', this.name,
        this.state.tariff, data.tariff
      )
    }
    this.state.tariff = data.tariff
    this.service.updateCharacteristic(
      my.Characteristic.Tariff, this.state.tariff
    )
  }
  if (
    data.l1 != null && data.l1.current != null &&
    data.l1.current !== this.state.currentl1
  ) {
    if (this.state.currentl1 != null) {
      this.log.info(
        '%s: set homekit l1 electric current from %s A to %s A', this.name,
        this.state.currentl1, data.l1.current
      )
    }
    this.state.currentl1 = data.l1.current
    this.service.updateCharacteristic(
      eve.Characteristic.ElectricCurrent, this.state.currentl1
    )
  }
  if (
    data.l2 != null && data.l2.current != null &&
    data.l2.current !== this.state.currentl2
  ) {
    if (this.state.currentl2 != null) {
      this.log.info(
        '%s: set homekit l2 electric current from %s A to %s A', this.name,
        this.state.currentl2, data.l2.current
      )
    }
    this.state.currentl2 = data.l2.current
    this.service.updateCharacteristic(
      eve.Characteristic.ElectricCurrent, this.state.currentl2
    )
  }
  if (
    data.l3 != null && data.l3.current != null &&
    data.l3.current !== this.state.currentl3
  ) {
    if (this.state.currentl3 != null) {
      this.log.info(
        '%s: set homekit l3 electric current from %s A to %s A', this.name,
        this.state.currentl3, data.l3.current
      )
    }
    this.state.currentl3 = data.l3.current
    this.service.updateCharacteristic(
      eve.Characteristic.ElectricCurrent, this.state.currentl3
    )
  }
  if (
    data.l1 != null && data.l1.voltage != null &&
    data.l1.voltage !== this.state.voltagel1
  ) {
    if (this.state.voltagel1 != null) {
      this.log.info(
        '%s: set homekit l1 voltage from %s V to %s V', this.name,
        this.state.voltagel1, data.l1.voltage
      )
    }
    this.state.voltagel1 = data.l1.voltage
    this.service.updateCharacteristic(
      eve.Characteristic.Voltage, this.state.voltagel1
    )
  }
  if (
    data.l2 != null && data.l2.voltage != null &&
    data.l2.voltage !== this.state.voltagel2
  ) {
    if (this.state.voltagel2 != null) {
      this.log.info(
        '%s: set homekit l2 voltage from %s V to %s V', this.name,
        this.state.voltagel2, data.l2.voltage
      )
    }
    this.state.voltagel2 = data.l2.voltage
    this.service.updateCharacteristic(
      eve.Characteristic.Voltage, this.state.voltagel2
    )
  }
  if (
    data.l3 != null && data.l3.voltage != null &&
    data.l3.voltage !== this.state.voltagel3
  ) {
    if (this.state.voltagel3 != null) {
      this.log.info(
        '%s: set homekit l1 voltage from %s V to %s V', this.name,
        this.state.voltagel3, data.l3.voltage
      )
    }
    this.state.voltagel3 = data.l3.voltage
    this.service.updateCharacteristic(
      eve.Characteristic.Voltage, this.state.voltagel3
    )
  }
}
