const AWS = require('aws-sdk')
const apiVersion = '2015-10-01'
const region = 'us-east-2'

const ec2 = new AWS.EC2({region: region, apiVersion: apiVersion})

let known_tags = [
	{
		tag: 'Owner',
		required: false,
		misspellings: ['Oner'],
	},
	{
		tag: 'Environment',
		required: false,
		misspellings: ['Enivronment', 'Enviornment'],
	},
	{
		tag: 'System',
		required: false,
		misspellings: [],
	},
	{
		tag: 'Subsystem',
		required: false,
		misspellings: ['SubSystem'],
	},
	{
		tag: 'Name',
		required: true,
		misspellings: [],
	},
]

function getEC2Instances() {
	return new Promise((resolve, reject) => {
		let request = ec2.describeInstances()

		request.send()

		request.on('success', (response) => {
			let data = response.data

			let all_instances = []
			for (let i = 0; i < data.Reservations.length; i++) {
				data.Reservations[i].Instances.forEach((instance) => {
					let single_instance = {
						instance_id: instance.InstanceId,
						tags: instance.Tags,
					}
					all_instances.push(single_instance)
				})
			}

			return resolve(all_instances)
		})

		request.on('error', (err) => {
			return reject(err)
		})

		request.on('complete', () => {})
	})
}

async function processInstances(instances, dryrun = true) {
	for (const instance of instances) {
		console.log(`Instance ID: ${instance.instance_id}`)

		//iterate over known tags or misspellings to determine if it needs to be fixed
		for (const kt of known_tags) {
			//see if this tag exists at all within this instance
			let key_found = false

			for (const tag of instance.tags) {
				if (tag.Key === kt.tag) {
					console.log(`key: "${kt.tag}" successfully found on instance`)

					key_found = true
				}

				//see if this tag is misspelled, or has spaces
				if (key_found === false && (kt.misspellings.includes(tag.Key) || tag.Key.trim() === kt.tag)) {
					key_found = true
					let new_value = {Key: kt.tag, Value: tag.Value}
					let new_value_exists = false
					console.log(`key: "${tag.Key}" is misspelled and needs to be renamed to "${kt.tag}"`)

					//we need to grab the key/value pair, add the new one, then drop the old once we confirm its good

					//add new key/pair value
					await createTags(instance.instance_id, new_value, dryrun).catch((err) => {
						console.log(err.message)
					})

					//check new key/pair value exists
					let new_tags = await getInstanceTags(instance.instance_id).catch(err => {
						console.log(err.message)

					})

					for (const new_tag of new_tags) {
						if(new_tag.Key === new_value.Key && new_tag.Value === new_value.Value) {
							new_value_exists

						}

					}

					console.log("New value exists, we can now safely remove the old")
					//remove old
				}
			}

			if (!key_found && kt.required) {
				console.warn(`key: "${kt.tag}" not found and is required!`)
			}
		}
	}
}

async function createTags(instance_id, tag, dryrun = true) {
	return new Promise((resolve, reject) => {
		let params = {
			Resources: [instance_id],
			Tags: [tag],
			DryRun: dryrun,
		}

		console.log(params)
		ec2.createTags(params, function (err, data) {
			if (err) return reject(err)

			return resolve(true)
		})
	})
}

async function getInstanceTags(instance_id) {
	return new Promise((resolve, reject) => {
		let params = {
			Filters: [
				{
					Name: 'resource-id',
					Values: [instance_id],
				},
			],
		}

		ec2.describeTags(params, function (err, data) {
			if (err) return reject(err)

			return resolve(data.Tags)
		})
	})
}

async function process(dryrun = true) {
	try {
		let instances = await getEC2Instances()
		await processInstances(instances, dryrun)
	} catch (err) {
		console.log(err)
	}
}

process()
